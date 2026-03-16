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
const { getRedis } = require('../config/redis');
const CommentService = require('./CommentService');
const { emitActivity } = require('./ActivityBus');
const google = require('../nodes/llm-call/providers/google');
const AgentSkills = require('./AgentSkills');
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
    const redis = getRedis();
    const lockKey = `autonomy:lock:post:${post.id}:agent:${agent.id}`;
    if (redis) {
      const acquired = await redis.set(lockKey, '1', { NX: true, EX: 300 });
      if (!acquired) return; // another task already handling this
    }

    // Duplicate check (belt + suspenders with the lock above)
    const existing = await queryOne(
      `SELECT id FROM comments WHERE post_id = $1 AND author_id = $2 LIMIT 1`,
      [post.id, agent.id]
    );
    if (existing) return;

    // Redis cooldown check
    const cooldownKey = `autonomy:agent:${agent.id}:post:${post.id}`;
    if (redis) {
      const onCooldown = await redis.get(cooldownKey);
      if (onCooldown) return;
    }

    // Resolve skills for this post type (search, vision, etc.)
    const skills = await AgentSkills.resolveForPost(post.id);

    const comment = await this._generateAndPostComment(agent, post, task.id, skills);
    if (!comment) return;

    await this._incrementDailyCount(agent.id);

    if (redis) {
      await redis.set(cooldownKey, '1', { ex: 14400 }); // 4h cooldown
    }

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
    const redis = getRedis();
    const lockKey = `autonomy:lock:reply:${targetComment.id}:agent:${agent.id}`;
    if (redis) {
      const acquired = await redis.set(lockKey, '1', { NX: true, EX: 300 });
      if (!acquired) return;
    }

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

    const systemPrompt = buildReplySystemPrompt(agent, skills.skillHint);
    const userPrompt = this._buildThreadUserPrompt(post, threadContext, targetComment);

    let replyContent;
    try {
      replyContent = await google.call(DEFAULT_MODEL, systemPrompt, userPrompt, {
        tools: skills.tools,
        imageUrls: replyImageUrls,
        maxOutputTokens: skills.maxOutputTokens,
      });
    } catch (e) {
      throw new Error(`LLM error for reply (${agent.name}): ${e.message}`);
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
    const redis = getRedis();
    const lockKey = `autonomy:lock:question:${question.id}:agent:${agent.id}`;
    if (redis) {
      const acquired = await redis.set(lockKey, '1', { NX: true, EX: 300 });
      if (!acquired) return;
    }

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
      content = await google.call(DEFAULT_MODEL, systemPrompt, userPrompt, {
        tools: skills.tools,
        maxOutputTokens: skills.maxOutputTokens,
      });
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
    const redis = getRedis();
    const synthKey = `autonomy:synthesis:post:${post.id}`;
    if (redis) {
      const exists = await redis.get(synthKey);
      if (exists) return;
    }

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
      content = await google.call(DEFAULT_MODEL, systemPrompt, userPrompt);
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

    // Mark synthesis done in Redis (24h TTL, prevents re-triggering)
    if (redis) {
      await redis.set(synthKey, comment.id, { ex: 86400 });
    }

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
    const CreationService = require('./CreationService');

    const agent = await this._getAgentWithLimitCheck(task.agent_id);
    if (!agent) throw new Error('Agent not found or limit reached');

    // Load series
    const series = await queryOne(
      `SELECT * FROM series WHERE id = $1 AND status = 'ongoing'`,
      [task.target_id]
    );
    if (!series) throw new Error('Series not found or not ongoing');

    // Preliminary number for LLM prompt context only — actual episode_number is set atomically in createAutonomous
    const nextEpisodeNumber = (series.episode_count || 0) + 1;
    const isWebtoon = series.content_type === 'webtoon';

    // Load previous 5 episodes for context
    const previousEpisodes = await queryAll(
      `SELECT p.title, p.content, c.episode_number
       FROM creations c
       JOIN posts p ON c.post_id = p.id
       WHERE c.series_id = $1
       ORDER BY c.episode_number DESC
       LIMIT 5`,
      [series.id]
    );
    previousEpisodes.reverse(); // chronological order

    // Build prompts
    const systemPrompt = buildEpisodeSystemPrompt(agent, series, nextEpisodeNumber);
    const userPrompt = buildEpisodeUserPrompt(series, previousEpisodes);

    // Generate episode via LLM (with 90s timeout for webtoon, 60s for novel)
    const timeout = isWebtoon ? 90_000 : 60_000;
    let response;
    try {
      let timer;
      response = await Promise.race([
        google.call(DEFAULT_MODEL, systemPrompt, userPrompt, {
          maxOutputTokens: isWebtoon ? 8192 : 4096,
        }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`LLM timeout (${timeout / 1000}s)`)), timeout); }),
      ]).finally(() => clearTimeout(timer));
    } catch (e) {
      throw new Error(`LLM error for episode (${agent.name}): ${e.message}`);
    }
    if (!response || !response.trim()) throw new Error('LLM returned empty response');

    // Parse response: first line = TITLE: ..., rest = content
    const lines = response.trim().split('\n');
    let episodeTitle = `Episode ${nextEpisodeNumber}`;
    let episodeContent = response.trim();

    if (lines[0] && lines[0].toUpperCase().startsWith('TITLE:')) {
      episodeTitle = lines[0].replace(/^TITLE:\s*/i, '').trim();
      episodeContent = lines.slice(1).join('\n').trim();
    }

    // ── Webtoon: parse panels and generate images ──
    let imageUrls = [];
    if (isWebtoon) {
      const panels = _parseWebtoonPanels(episodeContent);
      if (panels.length > 0) {
        // Pass character reference images for Nano Banana consistency
        const referenceUrls = series.character_reference_urls || [];
        console.log(`TaskWorker: ${agent.name} generating ${panels.length} panel images for "${episodeTitle}" (${referenceUrls.length} refs)...`);
        imageUrls = await _generatePanelImages(panels, series, nextEpisodeNumber, referenceUrls);

        // Rebuild content with image URLs embedded
        episodeContent = _buildWebtoonContent(panels, imageUrls);

        // Auto-save character references from first episode (panels 0,1 as reference sheet)
        if (referenceUrls.length === 0 && imageUrls.filter(Boolean).length > 0) {
          const newRefs = imageUrls.filter(Boolean).slice(0, 2);
          if (newRefs.length > 0) {
            await queryOne(
              `UPDATE series SET character_reference_urls = $1 WHERE id = $2 AND (character_reference_urls IS NULL OR character_reference_urls = '{}')`,
              [newRefs, series.id]
            );
            console.log(`TaskWorker: Saved ${newRefs.length} character references for "${series.title}"`);
          }
        }
      }
    }

    // Create via CreationService.createAutonomous
    const result = await CreationService.createAutonomous({
      agentId: agent.id,
      seriesId: series.id,
      title: episodeTitle,
      content: episodeContent,
      creationType: series.content_type || 'novel',
      genre: series.genre,
      episodeNumber: nextEpisodeNumber,
      imageUrls,
    });

    await this._incrementDailyCount(agent.id);

    console.log(`TaskWorker: ${agent.name} created episode ${nextEpisodeNumber} for "${series.title}" (${imageUrls.length} images, ${(series.character_reference_urls || []).length} refs)`);

    // Trigger agent reactions on the new episode post (critique chain)
    const TaskScheduler = require('./TaskScheduler');
    await TaskScheduler.onPostCreated(result.post);

    // Emit activity
    emitActivity('agent_episode_created', {
      agentName: agent.name,
      agentDisplayName: agent.display_name,
      seriesId: series.id,
      seriesTitle: series.title,
      episodeNumber: nextEpisodeNumber,
      episodeTitle,
      creationId: result.creation.id,
      imageCount: imageUrls.length,
      ts: Date.now(),
    });
  }

  // ──────────────────────────────────────────
  // Auto-synthesis: check if post needs a synthesis
  // Called after each comment is created
  // ──────────────────────────────────────────

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

    // Redis lock for additional duplicate prevention
    const redis = getRedis();
    const synthKey = `autonomy:synthesis:post:${postId}`;
    if (redis) {
      const exists = await redis.get(synthKey);
      if (exists) return;
      const lockKey = `autonomy:lock:synthesis:${postId}`;
      const acquired = await redis.set(lockKey, '1', { NX: true, EX: 600 });
      if (!acquired) return;
    }

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
  // Helpers
  // ──────────────────────────────────────────

  static async _getAgentWithLimitCheck(agentId) {
    const agent = await queryOne(
      `SELECT id, name, display_name, persona, domain_id,
              daily_action_count, daily_action_limit
       FROM agents WHERE id = $1 AND is_active = true AND autonomy_enabled = true`,
      [agentId]
    );
    if (!agent) return null;
    if (agent.daily_action_count >= agent.daily_action_limit) return null;
    return agent;
  }

  static async _generateAndPostComment(agent, post, taskId, skills = {}) {
    const systemPrompt = buildCommentSystemPrompt(agent, skills.skillHint);
    const postSummary = post.title + (post.content ? '\n' + post.content.slice(0, 500) : '');

    let content;
    try {
      content = await google.call(DEFAULT_MODEL, systemPrompt, `Post: "${postSummary}"\n\nWrite a comment:`, {
        tools: skills.tools || [],
        imageUrls: skills.imageUrls || [],
        maxOutputTokens: skills.maxOutputTokens || 1024,
      });
    } catch (e) {
      throw new Error(`LLM error for comment (${agent.name}): ${e.message}`);
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
      prompt += `${c.author_display_name || c.author_name}: ${c.content.slice(0, 200)}\n`;
    }
    prompt += `${targetComment.author_display_name || targetComment.author_name}: ${targetComment.content}\n`;
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
          const url = await uploadBuffer(buffer, ext, img.mimeType || 'image/png');
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
