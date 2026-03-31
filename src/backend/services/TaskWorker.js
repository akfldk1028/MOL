/**
 * TaskWorker — Event-Driven Agent Executor
 *
 * NO polling loop. Tasks are executed via setTimeout when created.
 * DB is used for durability/tracking only, not as a queue to poll.
 *
 * Flow:
 *   Event (post/comment created) → TaskScheduler.createTask()
 *     → INSERT into agent_tasks + setTimeout → _executeTask()
 *       → handler runs → may spawn more tasks (chain reaction)
 *
 * AgentLifecycle integration:
 *   AgentLifecycle.start() runs alongside TaskWorker.start().
 *   Agents wake up autonomously, browse feed, create tasks here.
 *
 * On server restart: recoverPendingTasks() re-schedules all pending tasks.
 */

const { queryOne, queryAll } = require('../config/database');
const store = require('../config/memory-store');
const CommentService = require('./CommentService');
const { emitActivity } = require('./ActivityBus');
const google = require('../nodes/llm-call/providers/google');
const openclaw = require('../nodes/llm-call/providers/openclaw');
const AgentSkills = require('./AgentSkills');
const { bridgeGenerateWithFallback, bridgeGenerate } = require('./BridgeClient');
const {
  buildCommentSystemPrompt,
  buildReplySystemPrompt,
  buildQuestionResponsePrompt,
  buildSynthesisPrompt,
} = require('./prompts/heartbeat-decision');
const {
  buildEpisodeSystemPrompt,
  buildEpisodeUserPrompt,
} = require('./prompts/episode-generation');

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const MAX_CONCURRENT = 3;

class TaskWorker {
  static _timers = new Map();       // taskId → timer handle
  static _activeCount = 0;
  static _waitQueue = [];           // taskIds waiting for concurrency slot
  static _paused = false;
  static _catalystInterval = null;
  static _stats = { processed: 0, failed: 0, startedAt: null };

  // ──────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────

  static async start() {
    this._stats.startedAt = new Date();
    this._paused = false;

    // Recover tasks that survived a restart
    await this.recoverPendingTasks();

    // Catalyst: single system sweep for quiet periods (NOT a per-agent heartbeat)
    this._catalystInterval = setInterval(() => {
      if (!this._paused) {
        this._runCatalyst().catch(err =>
          console.error('TaskWorker catalyst error:', err.message)
        );
      }
    }, 7_200_000); // every 2 hours

    // Start autonomous agent lifecycle (browse → discover → act)
    const AgentLifecycle = require('./AgentLifecycle');
    AgentLifecycle.start().catch(err =>
      console.error('AgentLifecycle start error:', err.message)
    );

    console.log('TaskWorker started (event-driven + autonomous browsing)');
  }

  static stop() {
    const AgentLifecycle = require('./AgentLifecycle');
    AgentLifecycle.stop();
    for (const timer of this._timers.values()) clearTimeout(timer);
    this._timers.clear();
    this._waitQueue = [];

    if (this._catalystInterval) {
      clearInterval(this._catalystInterval);
      this._catalystInterval = null;
    }
    console.log('TaskWorker stopped');
  }

  static pause() { this._paused = true; console.log('TaskWorker paused'); }
  static resume() { this._paused = false; console.log('TaskWorker resumed'); }

  static getStatus() {
    const AgentLifecycle = require('./AgentLifecycle');
    return {
      running: true,
      paused: this._paused,
      scheduledTimers: this._timers.size,
      activeExecutions: this._activeCount,
      waitQueue: this._waitQueue.length,
      stats: this._stats,
      lifecycle: AgentLifecycle.getStatus(),
    };
  }

  // ──────────────────────────────────────────
  // Scheduling (called by TaskScheduler)
  // ──────────────────────────────────────────

  /**
   * Schedule a task for execution after delayMs.
   * Called immediately when a task is inserted into the DB.
   */
  static scheduleExecution(taskId, delayMs) {
    if (this._paused) {
      console.log(`TaskWorker: SKIP schedule ${taskId.slice(0,8)} (paused)`);
      return;
    }
    console.log(`TaskWorker: schedule ${taskId.slice(0,8)} in ${Math.round(delayMs/1000)}s`);
    const timer = setTimeout(() => {
      console.log(`TaskWorker: timer fired for ${taskId.slice(0,8)}, enqueueing`);
      this._timers.delete(taskId);
      this._enqueue(taskId);
    }, delayMs);
    this._timers.set(taskId, timer);
  }

  /** Enqueue for execution, respecting concurrency limit */
  static _enqueue(taskId) {
    if (this._paused) return;
    if (this._activeCount >= MAX_CONCURRENT) {
      this._waitQueue.push(taskId);
      return;
    }
    this._run(taskId);
  }

  static async _run(taskId) {
    this._activeCount++;
    try {
      await this._executeTask(taskId);
    } finally {
      this._activeCount--;
      if (this._waitQueue.length > 0 && !this._paused) {
        this._run(this._waitQueue.shift());
      }
    }
  }

  // ──────────────────────────────────────────
  // Execution
  // ──────────────────────────────────────────

  static async _executeTask(taskId) {
    // Atomic claim — only process if still pending
    const task = await queryOne(
      `UPDATE agent_tasks SET status = 'processing', started_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [taskId]
    );
    if (!task) return; // already processed / cancelled

    // Governance: track LLM calls, skip if throttled
    try {
      const GovernanceEngine = require('../agent-system/governance');
      const allowed = await GovernanceEngine.trackLLMCall();
      if (!allowed) {
        console.log(`TaskWorker: throttled (hourly LLM limit), deferring ${task.id}`);
        await queryOne(`UPDATE agent_tasks SET status = 'pending', started_at = NULL WHERE id = $1`, [task.id]);
        this.scheduleExecution(task.id, 300_000); // retry in 5 min
        return;
      }
    } catch { /* governance optional */ }

    try {
      await this._handleTask(task);
      await queryOne(
        `UPDATE agent_tasks SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [task.id]
      );
      this._stats.processed++;
    } catch (err) {
      console.error(`TaskWorker: ${task.id} (${task.type}) failed:`, err.message);
      await queryOne(
        `UPDATE agent_tasks SET status = 'failed', error = $2, completed_at = NOW() WHERE id = $1`,
        [task.id, err.message.slice(0, 500)]
      );
      this._stats.failed++;
    }
  }

  static async _handleTask(task) {
    switch (task.type) {
      case 'react_to_post':       return this._handleReactToPost(task);
      case 'react_to_comment':    return this._handleReactToComment(task);
      case 'respond_to_question': return this._handleRespondToQuestion(task);
      case 'synthesize_post':     return this._handleSynthesizePost(task);
      case 'create_episode':      return this._handleCreateEpisode(task);
      case 'critique_episode':    return this._handleCritiqueEpisode(task);
      default:
        console.warn(`TaskWorker: unknown task type "${task.type}"`);
    }
  }

  // ──────────────────────────────────────────
  // Recovery (server restart)
  // ──────────────────────────────────────────

  static async recoverPendingTasks() {
    // Interrupted tasks → back to pending, reset created_at so they aren't immediately expired
    await queryOne(
      `UPDATE agent_tasks SET status = 'pending', started_at = NULL, created_at = NOW()
       WHERE status = 'processing'`
    );

    // Expire tasks older than 1 hour — they're stale from previous sessions
    const expired = await queryOne(
      `UPDATE agent_tasks SET status = 'cancelled'
       WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour'`
    );

    const pending = await queryAll(
      `SELECT id, scheduled_at FROM agent_tasks
       WHERE status = 'pending'
       ORDER BY scheduled_at ASC`
    );

    for (const t of pending) {
      const delayMs = Math.max(0, new Date(t.scheduled_at) - Date.now());
      this.scheduleExecution(t.id, delayMs);
    }

    if (pending.length > 0) {
      console.log(`TaskWorker: recovered ${pending.length} pending tasks (expired stale ones)`);
    }
  }

  // ──────────────────────────────────────────
  // Catalyst — finds neglected posts (NOT a heartbeat)
  // Runs once every 2h. Seeds new event chains if platform is quiet.
  // ──────────────────────────────────────────

  static async _runCatalyst() {
    const TaskScheduler = require('./TaskScheduler');

    // Posts from last 24h with no agent comments and no pending tasks
    const quietPosts = await queryAll(
      `SELECT p.id, p.title, p.content, p.author_id, p.comment_count, p.post_type
       FROM posts p
       WHERE p.created_at > NOW() - INTERVAL '24 hours'
         AND p.is_deleted = false
         AND p.comment_count < 2
         AND NOT EXISTS (
           SELECT 1 FROM agent_tasks t
           WHERE t.target_id = p.id AND t.status IN ('pending','processing')
         )
       ORDER BY p.comment_count ASC, p.created_at DESC
       LIMIT 3`
    );

    for (const post of quietPosts) {
      await TaskScheduler.onPostCreated(post);
    }

    if (quietPosts.length > 0) {
      console.log(`TaskWorker catalyst: seeded reactions for ${quietPosts.length} quiet posts`);
    }

    // Daily relationship decay (max once per 24h via Redis)
    try {
      const decayKey = 'system:relationship_decay_at';
      const lastDecay = store.getCooldown(decayKey);
      const dayMs = 24 * 60 * 60 * 1000;
      if (!lastDecay || Date.now() - Number(lastDecay) > dayMs) {
        const RelationshipGraph = require('../agent-system/relationships');
        await RelationshipGraph.applyDecay(0.995);
        store.setCooldown(decayKey, String(Date.now()), 86400);
        console.log('TaskWorker catalyst: applied daily relationship decay');
      }
    } catch (err) {
      console.error('TaskWorker catalyst: decay error:', err.message);
    }
  }

  // ──────────────────────────────────────────
  // Handler: react_to_post
  // ──────────────────────────────────────────

  static async _handleReactToPost(task) {
    const TaskScheduler = require('./TaskScheduler');

    const agent = await this._getAgentWithLimitCheck(task.agent_id);
    if (!agent) return;

    const post = await queryOne(
      `SELECT id, title, content, author_id FROM posts WHERE id = $1 AND is_deleted = false`,
      [task.target_id]
    );
    if (!post) return;

    // Atomic lock + duplicate check (prevents TOCTOU race)
    const lockKey = `autonomy:lock:post:${post.id}:agent:${agent.id}`;
    if (!store.acquireLock(lockKey, 300)) return;

    // Duplicate check (belt + suspenders with the lock above)
    const existing = await queryOne(
      `SELECT id FROM comments WHERE post_id = $1 AND author_id = $2 LIMIT 1`,
      [post.id, agent.id]
    );
    if (existing) return;

    // Cooldown check
    const cooldownKey = `autonomy:agent:${agent.id}:post:${post.id}`;
    if (store.getCooldown(cooldownKey)) return;

    // Resolve skills for this post type (search, vision, etc.)
    const skills = await AgentSkills.resolveForPost(post.id);

    const comment = await this._generateAndPostComment(agent, post, task.id, skills);
    if (!comment) return;

    await this._incrementDailyCount(agent.id);

    // Update relationship with post author
    if (post.author_id && post.author_id !== agent.id) {
      try {
        const RelationshipGraph = require('../agent-system/relationships');
        const { classifySentiment } = require('../agent-system/relationships/sentiment');
        const sentiment = classifySentiment(comment.content);
        await RelationshipGraph.updateFromInteraction(agent.id, post.author_id, sentiment);
      } catch (err) { console.warn('Relationship update skipped:', err.message); }
    }

    store.setCooldown(cooldownKey, '1', 14400); // 4h cooldown

    // Push to detail page via SSE (real-time update)
    await this._emitToDetailPage(post.id, agent, comment);

    // Chain reaction: other agents may reply to this comment
    await TaskScheduler.spawnReactions(
      { id: task.id, agentId: agent.id, chainDepth: task.chain_depth },
      'comment',
      comment.id
    );

    // Auto-synthesis check
    await this._checkAutoSynthesis(post.id);
  }

  // ──────────────────────────────────────────
  // Handler: react_to_comment (CAMEL-style ping-pong)
  // ──────────────────────────────────────────

  static async _handleReactToComment(task) {
    const TaskScheduler = require('./TaskScheduler');

    const agent = await this._getAgentWithLimitCheck(task.agent_id);
    if (!agent) return;

    const targetComment = await queryOne(
      `SELECT c.id, c.content, c.post_id, c.parent_id, c.depth, c.author_id,
              a.name as author_name, a.display_name as author_display_name
       FROM comments c
       JOIN agents a ON c.author_id = a.id
       WHERE c.id = $1 AND c.is_deleted = false`,
      [task.target_id]
    );
    if (!targetComment) return;
    if (targetComment.author_id === agent.id) return; // don't reply to self

    // Atomic lock + duplicate check (prevents TOCTOU race)
    const lockKey = `autonomy:lock:reply:${targetComment.id}:agent:${agent.id}`;
    if (!store.acquireLock(lockKey, 300)) return;

    // Duplicate check
    const existing = await queryOne(
      `SELECT id FROM comments WHERE parent_id = $1 AND author_id = $2 LIMIT 1`,
      [targetComment.id, agent.id]
    );
    if (existing) return;

    const post = await queryOne(
      `SELECT id, title, content FROM posts WHERE id = $1`,
      [targetComment.post_id]
    );
    if (!post) return;

    // Thread context (parent comments for conversational awareness)
    const threadContext = await this._getThreadContext(targetComment.id, 3);

    // Resolve skills for the parent post (critique replies get search, etc.)
    const skills = await AgentSkills.resolveForPost(post.id);

    // Don't pass images for chain replies — they're discussing comments, not re-analyzing panels
    const replyImageUrls = task.chain_depth === 0 ? skills.imageUrls : [];

    // Relationship-based tone modulation
    let toneHint = '';
    try {
      const { getToneInstruction } = require('../agent-system/relationships/tone-modulator');
      const parentAuthorId = targetComment.author_id;
      const parentAuthorName = targetComment.author_name || 'someone';
      if (parentAuthorId) toneHint = await getToneInstruction(agent.id, parentAuthorId, parentAuthorName);
    } catch { /* tone modulation optional */ }

    const systemPrompt = buildReplySystemPrompt(agent, skills.skillHint, toneHint);
    const userPrompt = this._buildThreadUserPrompt(post, threadContext, targetComment);

    // Cost-tier routing for replies
    const { selectTier } = require('../agent-system/cost');
    const tier = selectTier('react_to_comment', agent.llm_tier || 'standard', task.chain_depth || 0);

    let replyContent;
    if (!tier) {
      const { pickTemplate } = require('../agent-system/cost');
      replyContent = pickTemplate(targetComment.content).content;
    } else {
      try {
        // Build thread context string for Bridge
        const threadText = threadContext.map(c => `${c.author_display_name || c.author_name}: ${c.content.slice(0, 200)}`).join('\n');
        const targetText = `${targetComment.author_display_name || targetComment.author_name}: ${targetComment.content}`;

        replyContent = await bridgeGenerateWithFallback(
          '/v1/generate/reply',
          {
            agent_name: agent.name,
            post_content: `${post.title}\n${(post.content || '').slice(0, 300)}`,
            thread_context: threadText,
            target_comment: targetText,
            skill_hint: skills.skillHint || '',
            tone_hint: toneHint || '',
            max_tokens: tier.maxTokens,
          },
          { model: tier.model, systemPrompt, userPrompt, options: { tools: skills.tools, imageUrls: replyImageUrls, maxOutputTokens: tier.maxTokens } },
        );
      } catch (e) {
        throw new Error(`LLM error for reply (${agent.name}): ${e.message}`);
      }
    }
    if (!replyContent || !replyContent.trim()) return;

    const comment = await CommentService.create({
      postId: targetComment.post_id,
      authorId: agent.id,
      content: replyContent.trim(),
      parentId: targetComment.id,
      isHumanAuthored: false,
    });

    await queryOne(
      `UPDATE comments SET trigger_task_id = $1 WHERE id = $2`,
      [task.id, comment.id]
    );
    await this._incrementDailyCount(agent.id);

    // Update relationship with comment author (sentiment-based)
    if (targetComment.author_id && targetComment.author_id !== agent.id) {
      try {
        const RelationshipGraph = require('../agent-system/relationships');
        const { classifySentiment } = require('../agent-system/relationships/sentiment');
        const sentiment = classifySentiment(replyContent);
        await RelationshipGraph.updateFromInteraction(agent.id, targetComment.author_id, sentiment);
      } catch (err) { console.warn('Relationship update skipped:', err.message); }
    }

    console.log(`TaskWorker: ${agent.name} replied in post ${post.id}`);

    // Push to detail page via SSE (real-time update)
    await this._emitToDetailPage(targetComment.post_id, agent, comment);

    // Emit real-time activity event
    emitActivity('agent_replied', {
      agentName: agent.name,
      agentDisplayName: agent.display_name,
      postId: post.id,
      postTitle: post.title,
      commentId: comment.id,
      parentCommentAuthor: targetComment.author_display_name || targetComment.author_name,
      chainDepth: task.chain_depth,
      preview: comment.content?.slice(0, 100),
      ts: Date.now(),
    });

    // Chain continues — another agent may reply to THIS comment
    await TaskScheduler.spawnReactions(
      { id: task.id, agentId: agent.id, chainDepth: task.chain_depth },
      'comment',
      comment.id
    );

    // Auto-synthesis check
    await this._checkAutoSynthesis(targetComment.post_id);
  }

  // ──────────────────────────────────────────
  // Handler: respond_to_question (organic Q&A)
  // Agent "discovers" a question and shares their take
  // ──────────────────────────────────────────

  static async _handleRespondToQuestion(task) {
    const TaskScheduler = require('./TaskScheduler');

    const agent = await this._getAgentWithLimitCheck(task.agent_id);
    if (!agent) return;

    // Get question + post
    const question = await queryOne(
      `SELECT q.id, q.post_id, p.title, p.content
       FROM questions q JOIN posts p ON q.post_id = p.id
       WHERE q.id = $1`,
      [task.target_id]
    );
    if (!question) return;

    // Duplicate check (don't comment twice on same question)
    const lockKey = `autonomy:lock:question:${question.id}:agent:${agent.id}`;
    if (!store.acquireLock(lockKey, 300)) return;

    const existing = await queryOne(
      `SELECT id FROM comments WHERE post_id = $1 AND author_id = $2 LIMIT 1`,
      [question.post_id, agent.id]
    );
    if (existing) return;

    // Resolve skills for this question (search for tech/science domains, etc.)
    const skills = await AgentSkills.resolveForQuestion(question.id);

    // Generate response via LLM (with tools if resolved)
    const systemPrompt = buildQuestionResponsePrompt(agent, skills.skillHint);
    const userPrompt = `Question: "${question.title}"${question.content ? '\n' + question.content : ''}\n\nShare your thoughts:`;

    let content;
    try {
      content = await bridgeGenerateWithFallback(
        '/v1/generate/comment',
        { agent_name: agent.name, post_content: `${question.title}\n${question.content || ''}`, skill_hint: skills.skillHint || '', max_tokens: skills.maxOutputTokens || 512 },
        { model: DEFAULT_MODEL, systemPrompt, userPrompt, options: { tools: skills.tools, maxOutputTokens: skills.maxOutputTokens } },
      );
    } catch (e) {
      throw new Error(`LLM error for question response (${agent.name}): ${e.message}`);
    }
    if (!content || !content.trim()) return;

    // Create comment on the question's post
    const comment = await CommentService.create({
      postId: question.post_id,
      authorId: agent.id,
      content: content.trim(),
      isHumanAuthored: false,
    });

    await queryOne(
      `UPDATE comments SET trigger_task_id = $1 WHERE id = $2`,
      [task.id, comment.id]
    );
    await this._incrementDailyCount(agent.id);

    console.log(`TaskWorker: ${agent.name} responded to question "${question.title.slice(0, 40)}"`);

    // Push to detail page via SSE
    await this._emitToDetailPage(question.post_id, agent, comment);

    // Emit to activity bus (sidebar feed)
    emitActivity('agent_commented', {
      agentName: agent.name,
      agentDisplayName: agent.display_name,
      postId: question.post_id,
      postTitle: question.title,
      commentId: comment.id,
      preview: content.slice(0, 100),
      ts: Date.now(),
    });

    // Chain reaction: other agents may reply to this comment
    await TaskScheduler.spawnReactions(
      { id: task.id, agentId: agent.id, chainDepth: task.chain_depth },
      'comment',
      comment.id
    );

    // Auto-synthesis check
    await this._checkAutoSynthesis(question.post_id);
  }

  // ──────────────────────────────────────────
  // Handler: synthesize_post (auto-synthesis)
  // Triggered when a post reaches N comments
  // ──────────────────────────────────────────

  static async _handleSynthesizePost(task) {
    const agent = await this._getAgentWithLimitCheck(task.agent_id);
    if (!agent) return;

    const post = await queryOne(
      `SELECT id, title, content, comment_count FROM posts WHERE id = $1 AND is_deleted = false`,
      [task.target_id]
    );
    if (!post) return;

    // Double-check: still no synthesis comment?
    const synthKey = `autonomy:synthesis:post:${post.id}`;
    if (store.getCooldown(synthKey)) return;

    // Gather all comments on this post
    const comments = await queryAll(
      `SELECT c.content, a.name as author_name, a.display_name as author_display_name
       FROM comments c
       JOIN agents a ON c.author_id = a.id
       WHERE c.post_id = $1 AND c.is_deleted = false
       ORDER BY c.created_at ASC
       LIMIT 20`,
      [post.id]
    );
    if (comments.length < 5) return;

    // Build synthesis prompt
    const systemPrompt = buildSynthesisPrompt(agent);
    let userPrompt = `Post: "${post.title}"\n`;
    if (post.content) userPrompt += `${post.content.slice(0, 300)}\n`;
    userPrompt += '\n--- Discussion ---\n';
    for (const c of comments) {
      userPrompt += `${c.author_display_name || c.author_name}: ${c.content.slice(0, 200)}\n`;
    }
    userPrompt += '\n--- Write a synthesis of the discussion above ---\n';

    let content;
    try {
      content = await bridgeGenerateWithFallback(
        '/v1/generate/synthesis',
        { agent_name: agent.name, user_prompt: userPrompt },
        { model: DEFAULT_MODEL, systemPrompt, userPrompt },
      );
    } catch (e) {
      throw new Error(`LLM error for synthesis (${agent.name}): ${e.message}`);
    }
    if (!content || !content.trim()) return;

    const comment = await CommentService.create({
      postId: post.id,
      authorId: agent.id,
      content: content.trim(),
      isHumanAuthored: false,
    });

    await queryOne(
      `UPDATE comments SET trigger_task_id = $1 WHERE id = $2`,
      [task.id, comment.id]
    );
    await this._incrementDailyCount(agent.id);

    // Mark synthesis done (24h TTL, prevents re-triggering)
    store.setCooldown(synthKey, comment.id, 86400);

    console.log(`TaskWorker: ${agent.name} synthesized discussion on post ${post.id}`);

    // Push synthesis to detail page via SSE
    await this._emitToDetailPage(post.id, agent, comment);

    emitActivity('agent_synthesized', {
      agentName: agent.name,
      agentDisplayName: agent.display_name,
      postId: post.id,
      postTitle: post.title,
      commentId: comment.id,
      preview: content.slice(0, 100),
      ts: Date.now(),
    });
  }

  // ──────────────────────────────────────────
  // Handler: create_episode (autonomous series)
  // Agent generates a new episode for a series
  // ──────────────────────────────────────────

  static async _handleCreateEpisode(task) {
    const { EpisodeGenerator } = require('./webtoon');
    const EpisodeService = require('./EpisodeService');

    const agent = await this._getAgentWithLimitCheck(task.agent_id);
    if (!agent) throw new Error('Agent not found or limit reached');

    const series = await queryOne(
      `SELECT * FROM series WHERE id = $1 AND status = 'ongoing'`,
      [task.target_id]
    );
    if (!series) throw new Error('Series not found or not ongoing');

    // Check max_episodes limit
    if (series.max_episodes) {
      const currentCount = await queryOne(
        `SELECT COUNT(*) as cnt FROM episodes WHERE series_id = $1`,
        [series.id]
      );
      if (parseInt(currentCount?.cnt || '0', 10) >= series.max_episodes) {
        await queryOne(`UPDATE series SET status = 'completed' WHERE id = $1`, [series.id]);
        throw new Error(`Series "${series.title}" reached max episodes (${series.max_episodes})`);
      }
    }

    const nextEpisodeNumber = await EpisodeService.getNextNumber(series.id);

    // Load previous episodes with feedback for context
    const previousEpisodes = await EpisodeService.getRecentWithFeedback(series.id, 3);
    previousEpisodes.reverse(); // chronological

    // Collect feedback directives from previous episodes
    const feedbackDirectives = previousEpisodes
      .filter(ep => ep.feedback_directives && ep.feedback_directives.length > 0)
      .flatMap(ep => ep.feedback_directives);

    // Build prompts
    const systemPrompt = buildEpisodeSystemPrompt(agent, series, nextEpisodeNumber);
    const userPrompt = buildEpisodeUserPrompt(series, previousEpisodes, feedbackDirectives);

    // Generate script via LLM
    const timeout = 90_000;
    let response;
    try {
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`LLM timeout (${timeout / 1000}s)`)), timeout);
      });

      const llmPromise = bridgeGenerateWithFallback(
        '/v1/generate/episode',
        {
          agent_name: agent.name,
          series_info: { title: series.title, content_type: series.content_type, genre: series.genre, next_episode_number: nextEpisodeNumber },
          prev_episodes: previousEpisodes.map(e => ({ title: e.title, script_content: (e.script_content || '').slice(0, 500), episode_number: e.episode_number })),
          feedback_directives: feedbackDirectives,
          max_tokens: 8192,
          temperature: 0.8,
        },
        { model: DEFAULT_MODEL, systemPrompt, userPrompt, options: { maxOutputTokens: 8192 } },
        60000,
      );

      response = await Promise.race([llmPromise, timeoutPromise]).finally(() => clearTimeout(timer));
    } catch (e) {
      throw new Error(`LLM error for episode (${agent.name}): ${e.message}`);
    }

    if (!response || !response.trim()) throw new Error('LLM returned empty response');

    // Generate episode (script → images → DB)
    const { episode, imageUrls } = await EpisodeGenerator.generate({
      llmResponse: response,
      series,
      agent,
      episodeNumber: nextEpisodeNumber,
    });

    await this._incrementDailyCount(agent.id);

    // Auto-generate cover if missing
    if (!series.cover_image_url && imageUrls.length > 0) {
      try {
        await queryOne(
          'UPDATE series SET cover_image_url = $1 WHERE id = $2 AND cover_image_url IS NULL',
          [imageUrls[0], series.id]
        );
      } catch (err) {
        console.warn(`TaskWorker: cover set failed: ${err.message}`);
      }
    }

    // Mark previous feedback as applied
    const appliedIds = previousEpisodes
      .filter(ep => ep.feedback_directives?.length > 0 && !ep.feedback_applied)
      .map(ep => ep.id);
    if (appliedIds.length > 0) {
      await EpisodeService.markFeedbackApplied(appliedIds);
    }

    console.log(`TaskWorker: ${agent.name} created episode ${nextEpisodeNumber} for "${series.title}" (${imageUrls.length} pages)`);

    // Trigger critique chain
    const TaskScheduler = require('./TaskScheduler');
    await TaskScheduler.onEpisodeCreated(episode, agent.id);

    emitActivity('agent_episode_created', {
      agentName: agent.name,
      agentDisplayName: agent.display_name,
      seriesId: series.id,
      seriesTitle: series.title,
      episodeNumber: nextEpisodeNumber,
      episodeTitle: episode.title,
      pages: imageUrls.length,
      ts: Date.now(),
    });
  }

  // ──────────────────────────────────────────
  // Auto-synthesis: check if post needs a synthesis
  // Called after each comment is created
  // ──────────────────────────────────────────

  // ──────────────────────────────────────────
  // Handler: critique_episode
  // Agent critiques a published episode
  // ──────────────────────────────────────────

  static async _handleCritiqueEpisode(task) {
    const agent = await this._getAgentWithLimitCheck(task.agent_id);
    if (!agent) return;

    const episode = await queryOne(
      `SELECT e.*, s.title as series_title, s.genre, s.slug as series_slug
       FROM episodes e JOIN series s ON e.series_id = s.id
       WHERE e.id = $1`,
      [task.target_id]
    );
    if (!episode) return;

    // Duplicate check
    const existing = await queryOne(
      `SELECT id FROM comments WHERE episode_id = $1 AND author_id = $2 LIMIT 1`,
      [episode.id, agent.id]
    );
    if (existing) return;

    // Build critique prompt
    const scriptPreview = (episode.script_content || '').slice(0, 1000);
    const systemPrompt = [
      `You are ${agent.display_name || agent.name}, reviewing episode ${episode.episode_number} of "${episode.series_title}".`,
      agent.persona ? agent.persona.slice(0, 500) : '',
      '',
      'Write a short critique comment (2-4 sentences) about this episode.',
      'Be specific: mention what worked, what could improve. Be in character.',
      'Write in Korean or English based on your persona. Never reveal you are AI.',
    ].filter(Boolean).join('\n');

    const userPrompt = `Episode "${episode.title}" (${episode.genre}):\n${scriptPreview}`;

    let response;
    try {
      response = await bridgeGenerateWithFallback(
        '/v1/generate/comment',
        { agent_name: agent.name, prompt: userPrompt, max_tokens: 512 },
        { model: DEFAULT_MODEL, systemPrompt, userPrompt, options: { maxOutputTokens: 512 } },
        30000,
      );
    } catch (err) {
      console.error(`CritiqueEpisode: LLM failed for ${agent.name}: ${err.message}`);
      return;
    }

    if (!response || !response.trim()) return;

    // Clean up LLM response (remove quotes, trim)
    let content = response.trim();
    if (content.startsWith('"') && content.endsWith('"')) content = content.slice(1, -1);

    // Insert comment with episode_id
    const comment = await queryOne(
      `INSERT INTO comments (id, post_id, author_id, episode_id, content, is_human_authored, created_at, updated_at)
       VALUES (gen_random_uuid(), NULL, $1, $2, $3, false, NOW(), NOW())
       RETURNING *`,
      [agent.id, episode.id, content]
    );

    if (comment) {
      await queryOne(
        `UPDATE episodes SET comment_count = comment_count + 1 WHERE id = $1`,
        [episode.id]
      );
      await this._incrementDailyCount(agent.id);

      emitActivity('agent_critique_episode', {
        agentName: agent.name,
        episodeId: episode.id,
        seriesTitle: episode.series_title,
        episodeNumber: episode.episode_number,
        ts: Date.now(),
      });

      console.log(`CritiqueEpisode: ${agent.name} critiqued "${episode.title}" ep${episode.episode_number}`);
    }
  }

  static async _checkAutoSynthesis(postId) {
    const TaskScheduler = require('./TaskScheduler');
    const SYNTHESIS_THRESHOLD = 5;

    const post = await queryOne(
      `SELECT id, comment_count, author_id FROM posts WHERE id = $1`,
      [postId]
    );
    if (!post || post.comment_count < SYNTHESIS_THRESHOLD) return;

    // Check DB: synthesis task already scheduled/done?
    const existingTask = await queryOne(
      `SELECT id FROM agent_tasks
       WHERE target_id = $1 AND type = 'synthesize_post' AND status IN ('pending', 'processing', 'completed')
       LIMIT 1`,
      [postId]
    );
    if (existingTask) return;

    // Lock for additional duplicate prevention
    const synthKey = `autonomy:synthesis:post:${postId}`;
    if (store.getCooldown(synthKey)) return;
    const lockKey = `autonomy:lock:synthesis:${postId}`;
    if (!store.acquireLock(lockKey, 600)) return;

    // Pick a synthesizer agent (one that has NOT commented on this post yet)
    const agent = await queryOne(
      `SELECT a.id FROM agents a
       WHERE a.is_house_agent = true
         AND a.is_active = true
         AND a.autonomy_enabled = true
         AND a.id NOT IN (
           SELECT author_id FROM comments WHERE post_id = $1 AND is_deleted = false
         )
       ORDER BY RANDOM()
       LIMIT 1`,
      [postId]
    );
    if (!agent) return;

    await TaskScheduler.createTask({
      type: 'synthesize_post',
      agentId: agent.id,
      targetId: postId,
      targetType: 'post',
      delayMinutes: 1,
      chainDepth: 0,
    });

    console.log(`TaskWorker: auto-synthesis scheduled for post ${postId}`);
  }

  // ──────────────────────────────────────────
  // Critique Feedback Collection
  // ──────────────────────────────────────────

  /**
   * Collect top-scored agent critique comments from recent episodes.
   * Used to inject community feedback into the next episode generation prompt.
   * @param {string} seriesId
   * @param {number} limit - number of recent episodes to collect from
   * @returns {Promise<Array<{ episodeNumber: number, topComments: Array<{ authorName: string, archetype: string, content: string, score: number }> }>>}
   */
  static async _collectCritiqueFeedback(seriesId, limit = 3) {
    try {
      const rows = await queryAll(
        `SELECT c.episode_number, cm.content, cm.score, a.display_name, a.archetype
         FROM creations c
         JOIN comments cm ON cm.post_id = c.post_id
         JOIN agents a ON cm.author_id = a.id
         WHERE c.series_id = $1
           AND cm.is_deleted = false
           AND cm.is_human_authored = false
           AND cm.parent_id IS NULL
           AND cm.content NOT LIKE '@%'
           AND LENGTH(cm.content) >= 20
         ORDER BY c.episode_number DESC, cm.score DESC, LENGTH(cm.content) DESC`,
        [seriesId]
      );

      if (rows.length === 0) return [];

      // Group by episode, take top 3 per episode, limit to N episodes
      const episodeMap = new Map();
      for (const row of rows) {
        if (episodeMap.size >= limit && !episodeMap.has(row.episode_number)) break;
        if (!episodeMap.has(row.episode_number)) {
          episodeMap.set(row.episode_number, []);
        }
        const comments = episodeMap.get(row.episode_number);
        if (comments.length < 3) {
          comments.push({
            authorName: row.display_name || 'Agent',
            archetype: row.archetype || 'unknown',
            content: (row.content || '').slice(0, 150),
            score: row.score || 0,
          });
        }
      }

      // Convert to array sorted by episode number
      const raw = Array.from(episodeMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([episodeNumber, topComments]) => ({ episodeNumber, topComments }));

      // Distill: extract actionable improvements + 5-axis scores via LLM
      return this._distillFeedback(raw, seriesId);
    } catch (err) {
      console.warn('TaskWorker: critique feedback collection failed:', err.message);
      return [];
    }
  }

  /**
   * Distill raw critique comments into actionable improvement directives + 5-axis scores.
   * Based on Diffusion-Sharpening MLLMGrader evaluation framework:
   *   1. prompt_accuracy — 프롬프트/시놉시스 충실도
   *   2. creativity — 창의성/독창성
   *   3. quality — 글/이미지 품질
   *   4. consistency — 캐릭터/설정 일관성
   *   5. emotional_resonance — 감정/테마 전달력
   *
   * Results are saved to episode_feedback table for tracking reinforcement over time.
   */
  static async _distillFeedback(rawFeedback, seriesId = null) {
    if (rawFeedback.length === 0) return [];

    // Flatten all comments into a single block
    let inputText = '';
    let totalComments = 0;
    for (const ep of rawFeedback) {
      inputText += `Episode ${ep.episodeNumber} feedback:\n`;
      for (const c of ep.topComments) {
        inputText += `- [${c.archetype}] ${c.content}\n`;
        totalComments++;
      }
      inputText += '\n';
    }

    const distillPrompt = `You are a reward model for serialized story generation.
Analyze reader feedback and produce TWO outputs:

## PART 1: SCORES (0-10 scale, based on what readers indicate)
Rate the MOST RECENT episode based on reader sentiment:
- prompt_accuracy: How well does the episode follow the series premise/synopsis?
- creativity: How original and engaging is the storytelling?
- quality: Writing/image quality (prose, descriptions, dialogue)
- consistency: Character/setting consistency across episodes
- emotional_resonance: How well does it evoke intended emotions?
- overall: Weighted average

## PART 2: DIRECTIVES (3-5 actionable improvements for the NEXT episode)
- Convert praise → "continue doing X"
- Convert criticism → "improve X by doing Y"
- Each must be 1 specific, actionable sentence

Output EXACTLY this JSON format:
{"scores":{"prompt_accuracy":7,"creativity":6,"quality":8,"consistency":5,"emotional_resonance":7,"overall":6.6},"directives":["directive 1","directive 2","directive 3"]}

Use the SAME LANGUAGE as the majority of comments for directives.`;

    try {
      const response = await bridgeGenerateWithFallback(
        '/v1/generate/raw',
        { system_prompt: distillPrompt, user_prompt: inputText, max_tokens: 500, temperature: 0.3 },
        { model: 'gemini-2.5-flash-lite', systemPrompt: distillPrompt, userPrompt: inputText, options: { maxOutputTokens: 500 } },
      );

      if (!response || !response.trim()) return rawFeedback;

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return rawFeedback;

      const parsed = JSON.parse(jsonMatch[0]);
      const scores = parsed.scores || {};
      const directives = (parsed.directives || []).filter(d => d && d.length > 5);

      if (directives.length === 0) return rawFeedback;

      // Save to episode_feedback table
      const latestEp = rawFeedback[rawFeedback.length - 1]?.episodeNumber || 0;
      if (seriesId && latestEp > 0) {
        try {
          await queryOne(
            `INSERT INTO episode_feedback
              (series_id, episode_number, raw_comment_count, directives,
               score_prompt_accuracy, score_creativity, score_quality,
               score_consistency, score_emotional_resonance, score_overall)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (series_id, episode_number)
             DO UPDATE SET
               raw_comment_count = EXCLUDED.raw_comment_count,
               directives = EXCLUDED.directives,
               score_prompt_accuracy = EXCLUDED.score_prompt_accuracy,
               score_creativity = EXCLUDED.score_creativity,
               score_quality = EXCLUDED.score_quality,
               score_consistency = EXCLUDED.score_consistency,
               score_emotional_resonance = EXCLUDED.score_emotional_resonance,
               score_overall = EXCLUDED.score_overall`,
            [
              seriesId, latestEp, totalComments, JSON.stringify(directives),
              scores.prompt_accuracy || null, scores.creativity || null,
              scores.quality || null, scores.consistency || null,
              scores.emotional_resonance || null, scores.overall || null,
            ]
          );
          console.log(`TaskWorker: feedback saved — ep${latestEp} overall=${scores.overall} (${directives.length} directives)`);
        } catch (dbErr) {
          console.warn('TaskWorker: feedback DB save failed:', dbErr.message);
        }
      }

      return [{
        episodeNumber: latestEp,
        scores,
        topComments: directives.map(d => ({
          authorName: 'Community',
          archetype: 'distilled',
          content: d,
          score: 0,
        })),
      }];
    } catch (err) {
      console.warn('TaskWorker: feedback distillation failed:', err.message);
      return rawFeedback;
    }
  }

  // ──────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────

  static async _getAgentWithLimitCheck(agentId) {
    const agent = await queryOne(
      `SELECT id, name, display_name, persona, domain_id,
              daily_action_count, daily_action_limit,
              archetype, llm_tier, activity_config, speaking_style, expertise_topics
       FROM agents WHERE id = $1 AND is_active = true AND autonomy_enabled = true`,
      [agentId]
    );
    if (!agent) return null;
    if (agent.daily_action_count >= agent.daily_action_limit) return null;
    return agent;
  }

  static async _generateAndPostComment(agent, post, taskId, skills = {}) {
    const postSummary = post.title + (post.content ? '\n' + post.content.slice(0, 500) : '');

    // Get other commenters on this post for @mention context
    const otherCommenters = await queryAll(
      `SELECT DISTINCT a.name FROM comments c
       JOIN agents a ON c.author_id = a.id
       WHERE c.post_id = $1 AND c.author_id != $2 AND c.is_deleted = false
       ORDER BY c.created_at DESC LIMIT 5`,
      [post.id, agent.id]
    ).catch(() => []);
    const commenterNames = otherCommenters.map(c => c.name);

    // Relationship tone for post author
    let toneHint = '';
    if (post.author_id && post.author_id !== agent.id) {
      try {
        const { getToneInstruction } = require('../agent-system/relationships/tone-modulator');
        toneHint = await getToneInstruction(agent.id, post.author_id, '');
      } catch {}
    }

    // Cost-tier routing: rule_based agents use template responses
    const { selectTier, pickTemplate } = require('../agent-system/cost');
    const tier = selectTier('react_to_post', agent.llm_tier || 'standard');

    let content;
    if (!tier) {
      // Template response (no LLM call)
      const tmpl = pickTemplate(postSummary);
      content = tmpl.content;
      console.log(`TaskWorker: ${agent.name} template response (${tmpl.type})`);
    } else {
      const systemPrompt = buildCommentSystemPrompt(agent, skills.skillHint, toneHint, commenterNames);
      const userPrompt = `Post: "${postSummary}"\n\nWrite your comment:`;
      try {
        content = await bridgeGenerateWithFallback(
          '/v1/generate/comment',
          { agent_name: agent.name, post_content: postSummary, skill_hint: skills.skillHint || '', max_tokens: tier.maxTokens },
          { model: tier.model, systemPrompt, userPrompt, options: { tools: skills.tools || [], imageUrls: skills.imageUrls || [], maxOutputTokens: tier.maxTokens } },
        );
      } catch (e) {
        throw new Error(`LLM error for comment (${agent.name}): ${e.message}`);
      }
    }
    if (!content || !content.trim()) return null;

    const comment = await CommentService.create({
      postId: post.id,
      authorId: agent.id,
      content: content.trim(),
      isHumanAuthored: false,
    });

    await queryOne(
      `UPDATE comments SET trigger_task_id = $1 WHERE id = $2`,
      [taskId, comment.id]
    );

    console.log(`TaskWorker: ${agent.name} commented on post ${post.id}`);

    // Emit real-time activity event
    emitActivity('agent_commented', {
      agentName: agent.name,
      agentDisplayName: agent.display_name,
      postId: post.id,
      postTitle: post.title,
      commentId: comment.id,
      preview: comment.content?.slice(0, 100),
      ts: Date.now(),
    });

    return comment;
  }

  static async _incrementDailyCount(agentId) {
    await queryOne(
      `UPDATE agents SET daily_action_count = daily_action_count + 1 WHERE id = $1`,
      [agentId]
    );
  }

  static async _getThreadContext(commentId, maxDepth) {
    const rows = await queryAll(
      `WITH RECURSIVE thread AS (
         SELECT c.id, c.content, c.parent_id, c.author_id, c.is_human_authored,
                1 as depth
         FROM comments c
         WHERE c.id = (SELECT parent_id FROM comments WHERE id = $1)
         UNION ALL
         SELECT c2.id, c2.content, c2.parent_id, c2.author_id, c2.is_human_authored,
                t.depth + 1
         FROM thread t
         JOIN comments c2 ON c2.id = t.parent_id
         WHERE t.depth < $2
       )
       SELECT t.id, t.content, t.parent_id,
              COALESCE(a.name, u.name, 'Unknown') as author_name,
              COALESCE(a.display_name, u.name, 'Unknown') as author_display_name
       FROM thread t
       LEFT JOIN agents a ON t.author_id = a.id AND t.is_human_authored = false
       LEFT JOIN users u ON t.author_id = u.id::text AND t.is_human_authored = true
       ORDER BY t.depth DESC`,
      [commentId, maxDepth]
    );
    return rows;
  }

  /**
   * Emit SSE to the Q&A/critique detail page.
   * Looks up question/creation by post_id and emits to their channel.
   */
  static async _emitToDetailPage(postId, agent, comment) {
    const OrchestratorService = require('./OrchestratorService');

    // Check if this post belongs to a question
    const question = await queryOne(
      'SELECT id FROM questions WHERE post_id = $1', [postId]
    );
    if (question) {
      OrchestratorService.emit(question.id, 'agent_response', {
        agentName: agent.display_name || agent.name,
        role: 'respondent',
        content: comment.content,
        commentId: comment.id,
      });
      return;
    }

    // Check if this post belongs to a creation
    const creation = await queryOne(
      'SELECT id FROM creations WHERE post_id = $1', [postId]
    );
    if (creation) {
      OrchestratorService.emit(creation.id, 'agent_response', {
        agentName: agent.display_name || agent.name,
        role: 'respondent',
        content: comment.content,
        commentId: comment.id,
      });
    }
  }

  static _buildThreadUserPrompt(post, threadContext, targetComment) {
    let prompt = `Post: "${post.title}"\n`;
    if (post.content) prompt += `${post.content.slice(0, 300)}\n`;
    prompt += '\n--- Thread ---\n';
    for (const c of threadContext) {
      prompt += `@${c.author_display_name || c.author_name}: ${c.content.slice(0, 200)}\n`;
    }
    prompt += `@${targetComment.author_display_name || targetComment.author_name}: ${targetComment.content}\n`;
    prompt += '\n--- Your reply ---\n';
    return prompt;
  }
}

// ── Webtoon panel helpers ──

/**
 * Parse [PANEL]...[/PANEL] blocks from LLM response
 * Returns array of { image: string, text: string }
 */
function _parseWebtoonPanels(content) {
  const panels = [];
  const regex = /\[PANEL\]\s*\n([\s\S]*?)\[\/PANEL\]/gi;
  const MAX_PANELS = 20;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (panels.length >= MAX_PANELS) break;
    const block = match[1].trim().slice(0, 2000); // limit per-panel size
    const imageMatch = block.match(/^IMAGE:\s*(.+)/im);
    const textMatch = block.match(/^TEXT:\s*([\s\S]*?)$/im);
    panels.push({
      image: imageMatch ? imageMatch[1].trim() : '',
      text: textMatch ? textMatch[1].trim() : '',
    });
  }
  return panels;
}

/**
 * Generate panel images via Nano Banana (Gemini) and upload to storage.
 * Returns array of image URLs (same order as panels).
 * Failed panels get null (skipped gracefully).
 */
async function _generatePanelImages(panels, series, episodeNumber, referenceUrls = []) {
  const imageGen = require('./skills/image-gen');
  const { uploadBuffer } = require('../utils/storage');
  const urls = [];

  const stylePrefix = `Webtoon style, vertical scroll comic panel, ${series.genre || 'fantasy'}, full color, high quality illustration. `;

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    if (!panel.image) { urls.push(null); continue; }

    const maxRetries = 2;
    let generated = false;
    for (let attempt = 0; attempt < maxRetries && !generated; attempt++) {
      try {
        if (attempt > 0) console.log(`  Panel ${i + 1}/${panels.length}: retry ${attempt}...`);
        const result = await Promise.race([
          imageGen.generate({
            prompt: stylePrefix + panel.image,
            aspectRatio: '9:16', // vertical webtoon panel
            referenceImageUrls: referenceUrls.length > 0 ? referenceUrls : undefined,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Image gen timeout')), 30_000)),
        ]);

        const img = result.images?.[0];
        if (img?.b64) {
          const ext = (img.mimeType || '').includes('jpeg') ? '.jpg' : '.png';
          const buffer = Buffer.from(img.b64, 'base64');
          const url = await uploadBuffer(buffer, ext, img.mimeType || 'image/png', 'webtoons', {
            seriesSlug: series.slug, episodeNumber, panelIndex: i,
          });
          urls.push(url);
          console.log(`  Panel ${i + 1}/${panels.length}: generated (${result.provider})`);
          generated = true;
        } else if (img?.url) {
          urls.push(img.url);
          console.log(`  Panel ${i + 1}/${panels.length}: generated (${result.provider})`);
          generated = true;
        }
      } catch (e) {
        console.warn(`  Panel ${i + 1}/${panels.length}: image gen failed (attempt ${attempt + 1}) — ${e.message}`);
      }
    }
    if (!generated) urls.push(null);
  }

  return urls;
}

/**
 * Rebuild webtoon episode content with image URLs embedded as markdown
 */
function _buildWebtoonContent(panels, imageUrls) {
  const parts = [];
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const url = imageUrls[i];
    if (url) {
      parts.push(`![Panel ${i + 1}](${url})`);
    }
    if (panel.text) {
      parts.push(panel.text);
    }
    parts.push(''); // blank line between panels
  }
  return parts.join('\n');
}

module.exports = TaskWorker;
