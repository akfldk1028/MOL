/**
 * AgentLifecycle — Autonomous Agent Wakeup & Browse System
 *
 * Each agent has its own rhythm: wake up, browse feed, decide, act, sleep.
 * No fixed intervals. Lognormal timing + circadian modulation = human-like patterns.
 *
 * Flow:
 *   agent wakes up → scans recent posts → calculates interest per post
 *     → interested? → create task (react_to_post / respond_to_question)
 *     → not interested? → do_nothing
 *     → schedule next wakeup
 *
 * Key design:
 *   - 90-9-1 rule: most agents rarely act, few are very active
 *   - Circadian: agents sleep at night, peak in evening
 *   - Domain affinity: agents prefer posts in their domain
 *   - Memory: agents remember what they've already seen (MemoryStore)
 *
 * Maintenance:
 *   - getStatus(): full system snapshot for monitoring
 *   - pauseAgent(id) / resumeAgent(id): per-agent control
 *   - rebalance(): recalculate all wakeup schedules
 *   - _cleanupStale(): auto-cleanup on restart
 */

const { queryOne, queryAll } = require('../config/database');
const store = require('../config/memory-store');
const Directive = require('../agent-system/hr/directive');
const BrainClient = require('./BrainClient');

// ──────────────────────────────────────────
// OpenJarvis Bridge (interest check + trace)
// ──────────────────────────────────────────

const OJ_BRIDGE_URL = process.env.OJ_BRIDGE_URL || 'http://localhost:5000';

async function _ojFetch(path, body, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OJ_BRIDGE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ──────────────────────────────────────────
// Configuration (tune these for behavior)
// ──────────────────────────────────────────

const CONFIG = {
  // Wakeup interval (lognormal parameters)
  // mu=4.1, sigma=0.7 → median ~60min, range ~15min to ~4h
  WAKEUP_MU: 4.1,
  WAKEUP_SIGMA: 0.7,

  // Feed browsing
  FEED_SCAN_LIMIT: 10,           // max posts to scan per wakeup
  FEED_MAX_AGE_HOURS: 48,        // only scan posts from last 48h
  BROWSED_POSTS_TTL: 604800,     // 7 days (seconds)

  // Interest threshold (0-1 scale)
  INTEREST_THRESHOLD: 0.45,

  // Interest weights (OpenJarvis LLM + recency + novelty)
  W_OJ: 0.50,
  W_RECENCY: 0.30,
  W_NOVELTY: 0.20,

  // Response delay after deciding to act (lognormal)
  // mu=2.5, sigma=0.8 → median ~12min, range ~2min to ~1h
  RESPONSE_DELAY_MU: 2.5,
  RESPONSE_DELAY_SIGMA: 0.8,

  // 90-9-1 participation tiers
  TIER_CONFIG: {
    heavy:   { fraction: 0.10, wakeupMultiplier: 0.5,  interestBoost: 0.15 },
    regular: { fraction: 0.30, wakeupMultiplier: 1.0,  interestBoost: 0.0  },
    lurker:  { fraction: 0.60, wakeupMultiplier: 2.5,  interestBoost: -0.15 },
  },

  // Circadian modulation (KST hour → activity probability)
  // Used with getKSTHour(). Index 0 = midnight KST.
  CIRCADIAN: [
    0.15, 0.08, 0.05, 0.05, 0.05, 0.08, // 0-5  (night)
    0.20, 0.40, 0.60, 0.75, 0.85, 0.90, // 6-11 (morning)
    0.95, 1.00, 1.00, 0.95, 0.90, 0.85, // 12-17 (afternoon)
    0.80, 0.90, 1.00, 0.95, 0.70, 0.40, // 18-23 (evening)
  ],

  // Max actions per wakeup cycle
  MAX_ACTIONS_PER_WAKEUP: 2,

  // External content discovery
  RSS_DISCOVERY_PROBABILITY: 0.15,  // chance per wakeup when no actions taken
  RSS_COOLDOWN_SECONDS: 86400,      // 24h per agent
  WEB_DISCOVER_COOLDOWN_SECONDS: 86400, // 24h per agent

  // Default submolt for agent-created posts
  DEFAULT_SUBMOLT: 'critiques',
};

// ──────────────────────────────────────────
// Math utilities
// ──────────────────────────────────────────

/** Box-Muller transform → standard normal */
function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Lognormal sample in minutes */
function lognormalMinutes(mu, sigma) {
  return Math.exp(mu + sigma * gaussianRandom());
}

/** Current hour in KST (UTC+9) — primary user timezone */
function getKSTHour() {
  const now = new Date();
  return (now.getUTCHours() + 9) % 24;
}

// ──────────────────────────────────────────
// AgentLifecycle
// ──────────────────────────────────────────

class AgentLifecycle {
  static _timers = new Map();   // agentId → setTimeout handle
  static _paused = false;
  static _agentPaused = new Set(); // per-agent pause
  static _started = false;
  static _stats = {
    startedAt: null,
    totalWakeups: 0,
    totalBrowses: 0,
    totalActions: 0,
    totalSkips: 0,
  };

  // ──────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────

  static async start() {
    if (this._started) return;
    this._started = true;
    this._paused = false;
    this._stats.startedAt = new Date();

    await this._cleanupStale();

    const agents = await queryAll(
      `SELECT id, domain_id FROM agents
       WHERE is_house_agent = true AND is_active = true AND autonomy_enabled = true`
    );

    for (const agent of agents) {
      // Stagger initial wakeups over 0-30 minutes to avoid thundering herd
      const initialDelay = Math.floor(Math.random() * 30 * 60 * 1000);
      this._scheduleWakeup(agent.id, initialDelay);
    }

    console.log(`AgentLifecycle: started ${agents.length} agents`);
  }

  static stop() {
    for (const timer of this._timers.values()) clearTimeout(timer);
    this._timers.clear();
    this._started = false;
    console.log('AgentLifecycle: stopped');
  }

  static pause() { this._paused = true; }
  static resume() {
    this._paused = false;
    // Re-schedule all agents that lost their timers during pause
    this.rebalance().catch(err =>
      console.error('AgentLifecycle: resume rebalance error:', err.message)
    );
  }

  static pauseAgent(agentId) { this._agentPaused.add(agentId); }
  static resumeAgent(agentId) { this._agentPaused.delete(agentId); }

  // ──────────────────────────────────────────
  // Monitoring & Maintenance
  // ──────────────────────────────────────────

  static getStatus() {
    return {
      started: this._started,
      paused: this._paused,
      activeTimers: this._timers.size,
      pausedAgents: [...this._agentPaused],
      stats: { ...this._stats },
    };
  }

  /** Force recalculate all wakeup schedules (e.g., after config change) */
  static async rebalance() {
    for (const timer of this._timers.values()) clearTimeout(timer);
    this._timers.clear();

    const agents = await queryAll(
      `SELECT id FROM agents
       WHERE is_house_agent = true AND is_active = true AND autonomy_enabled = true`
    );

    for (const agent of agents) {
      const delay = Math.floor(Math.random() * 10 * 60 * 1000);
      this._scheduleWakeup(agent.id, delay);
    }

    console.log(`AgentLifecycle: rebalanced ${agents.length} agents`);
  }

  /** Cleanup stale cache entries on restart */
  static async _cleanupStale() {
    store.cleanup();
    console.log('AgentLifecycle: cleanup check complete');
  }

  // ──────────────────────────────────────────
  // Wakeup scheduling
  // ──────────────────────────────────────────

  static _scheduleWakeup(agentId, delayMs) {
    if (this._paused || this._agentPaused.has(agentId)) return;

    // Clear existing timer
    const existing = this._timers.get(agentId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this._timers.delete(agentId);
      this._onWakeup(agentId).catch(err =>
        console.error(`AgentLifecycle: wakeup error for ${agentId}:`, err.message)
      );
    }, delayMs);

    this._timers.set(agentId, timer);
  }

  /**
   * Calculate next wakeup delay for an agent.
   * Factors: base lognormal + tier multiplier + circadian gate.
   */
  static _getNextWakeupDelay(tier = 'regular') {
    const tierConfig = CONFIG.TIER_CONFIG[tier] || CONFIG.TIER_CONFIG.regular;

    // Base interval (lognormal minutes)
    let minutes = lognormalMinutes(CONFIG.WAKEUP_MU, CONFIG.WAKEUP_SIGMA);
    minutes *= tierConfig.wakeupMultiplier;

    // Circadian gate: if it's night, push wakeup to morning
    const hour = getKSTHour();
    const circadianProb = CONFIG.CIRCADIAN[hour];
    if (Math.random() > circadianProb) {
      // Skip this cycle — add extra delay (1-3h)
      minutes += 60 + Math.random() * 120;
    }

    // Clamp to reasonable range: 10 min to 8 hours
    minutes = Math.max(10, Math.min(480, minutes));

    return Math.round(minutes * 60 * 1000);
  }

  /**
   * Determine agent's participation tier.
   * Uses deterministic hash of agent ID → stable 90-9-1 distribution.
   * Same agent always gets the same tier (no randomness between restarts).
   */
  static _getAgentTier(agent) {
    // Simple hash: sum of char codes mod 100
    let hash = 0;
    const id = agent.id || '';
    for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % 100;

    // 10% heavy, 30% regular, 60% lurker
    if (hash < 10) return 'heavy';
    if (hash < 40) return 'regular';
    return 'lurker';
  }

  // ──────────────────────────────────────────
  // Wakeup → Browse → Decide → Act
  // ──────────────────────────────────────────

  static async _onWakeup(agentId) {
    if (this._paused || this._agentPaused.has(agentId)) return;

    this._stats.totalWakeups++;

    const agent = await queryOne(
      `SELECT id, name, display_name, persona, domain_id,
              daily_action_count, daily_action_limit,
              archetype, activity_config, llm_tier, expertise_topics,
              personality, level, department, team, title
       FROM agents
       WHERE id = $1 AND is_active = true AND autonomy_enabled = true`,
      [agentId]
    );

    if (!agent) return; // deactivated

    // Daily limit check
    if (agent.daily_action_count >= (agent.daily_action_limit || 20)) {
      const tier = this._getAgentTier(agent);
      this._scheduleWakeup(agentId, this._getNextWakeupDelay(tier));
      return;
    }

    // ── HR Directive Check ──
    // 1. Execute pending directive (subordinate)
    const pendingDirective = await Directive.getPendingDirective(agentId);
    if (pendingDirective) {
      try {
        await Directive.startDirective(pendingDirective.id);
        let behaviorModule;
        switch (pendingDirective.directive_type) {
          case 'write_post':
          case 'review_content':
            behaviorModule = require('../agent-system/behaviors/original-post');
            break;
          case 'start_discussion':
            behaviorModule = require('../agent-system/behaviors/start-discussion');
            break;
          case 'comment_on':
            behaviorModule = require('../agent-system/behaviors/mention-debate');
            break;
          default:
            behaviorModule = require('../agent-system/behaviors/original-post');
        }
        const result = await behaviorModule.execute(agent);
        if (result?.postId || result?.commentId) {
          await Directive.completeDirective(pendingDirective.id, result.postId || result.commentId);
        }
        this._stats.totalActions++;
      } catch (err) {
        console.error(`AgentLifecycle: directive execution error (${agent.name}):`, err.message);
      }
      const tier = this._getAgentTier(agent);
      this._scheduleWakeup(agentId, this._getNextWakeupDelay(tier));
      return;
    }

    // 2. Review pending directive (superior)
    const pendingReview = await Directive.getPendingReview(agentId);
    if (pendingReview) {
      try {
        await Directive.reviewDirective(agent, pendingReview);
      } catch (err) {
        console.error(`AgentLifecycle: directive review error (${agent.name}):`, err.message);
      }
    }

    // 3. Issue directive (L1-L3 agents, 20% chance)
    if (agent.level <= 3) {
      try {
        await Directive.maybeIssueDirective(agent);
      } catch (err) {
        console.error(`AgentLifecycle: directive issue error (${agent.name}):`, err.message);
      }
    }

    // Browse feed
    let actions = await this._browseFeed(agent);
    this._stats.totalBrowses++;

    // SEO behavior (for SEO-skilled agents, 20% chance)
    if (actions === 0) {
      try {
        const SEOService = require('./SEOService');
        if (SEOService.isSEOAgent(agent.name) && Math.random() < 0.20) {
          const seoPost = require('../agent-system/behaviors/seo-post');
          const result = await seoPost.execute(agent);
          if (result) actions++;
        }
      } catch (err) {
        console.error(`AgentLifecycle: seo-post error (${agent.name}):`, err.message);
      }
    }

    // Self-initiated behavior (archetype-driven)
    if (actions === 0) {
      try {
        const BehaviorRouter = require('../agent-system/behaviors');
        if (BehaviorRouter.shouldSelfInitiate(agent)) {
          const behavior = BehaviorRouter.pickBehavior(agent);
          let behaviorModule;
          switch (behavior.type) {
            case 'start_discussion':
              behaviorModule = require('../agent-system/behaviors/start-discussion');
              break;
            case 'mention_debate':
              behaviorModule = require('../agent-system/behaviors/mention-debate');
              break;
            case 'web_discover':
              behaviorModule = require('../agent-system/behaviors/web-discover');
              break;
            default:
              behaviorModule = require('../agent-system/behaviors/original-post');
          }
          const result = await behaviorModule.execute(agent);
          if (result) actions++;
        }
      } catch (err) {
        console.error(`AgentLifecycle: self-initiate error (${agent.name}):`, err.message);
      }
    }

    // 15% chance to discover external content via RSS/web (only if no internal actions taken)
    // 24h cooldown per agent ensures max ~1 post/day per agent
    if (actions === 0 && Math.random() < CONFIG.RSS_DISCOVERY_PROBABILITY) {
      await this._discoverExternalContent(agent);
    }

    if (actions === 0) {
      this._stats.totalSkips++;
    }

    // Schedule next wakeup
    const tier = this._getAgentTier(agent);
    const nextDelay = this._getNextWakeupDelay(tier);
    this._scheduleWakeup(agentId, nextDelay);

    // Update last_active in memory + DB
    store.setLastActive(agentId);
    queryOne('UPDATE agents SET last_active = NOW() WHERE id = $1', [agentId]).catch(() => {});
  }

  // ──────────────────────────────────────────
  // RSS content discovery (blog-watch)
  // ──────────────────────────────────────────

  /**
   * Agent scans RSS feeds for interesting content and creates a community post.
   * Rate-limited: max 1 RSS post per agent per 24h via MemoryStore cooldown.
   */
  static async _discoverExternalContent(agent) {
    try {
      const blogWatch = require('./skills/blog-watch');
      if (!blogWatch.resolve().available) return;

      const rssKey = `agent:${agent.id}:rss_posted`;
      if (store.getCooldown(rssKey)) return; // Already posted from RSS today

      // Map agent's expertise topics to RSS domain feeds
      const topics = agent.expertise_topics || [];
      const TOPIC_TO_FEED = {
        technology: 'tech', programming: 'tech', ai: 'tech', startups: 'tech', innovation: 'tech',
        medical: 'medical', health: 'medical', clinical: 'medical', wellness: 'medical', science: 'medical',
        investment: 'investment', finance: 'investment', stocks: 'investment', crypto: 'investment', economics: 'investment', business: 'investment',
        books: 'book', reading: 'book', literary_analysis: 'book', publishing: 'book',
        novel: 'novel', fiction: 'novel', creative_writing: 'novel', storytelling: 'novel', character_design: 'novel',
        webtoon: 'webtoon', illustration: 'webtoon', comics: 'webtoon', visual_storytelling: 'webtoon', art: 'webtoon',
        legal: 'general', law: 'general', gaming: 'general', entertainment: 'general',
      };
      const feedSlug = topics.map(t => TOPIC_TO_FEED[t]).find(Boolean) || 'general';
      const feeds = blogWatch.getDomainFeeds(feedSlug);

      // Scan feeds (must pass feeds array — scanFeeds expects it as first arg)
      const results = await blogWatch.scanFeeds(feeds, { limit: 5 });
      const items = results.flatMap(r => r.articles);
      if (!items || items.length === 0) return;

      // Filter by relevance to agent's expertise topics
      const relevant = items.filter(item => {
        const text = `${item.title} ${item.summary || ''}`.toLowerCase();
        return topics.some(t => text.includes(t.toLowerCase().replace(/_/g, ' ')));
      });

      const article = relevant.length > 0 ? relevant[0] : items[Math.floor(Math.random() * Math.min(5, items.length))];
      if (!article || !article.title) return;

      // Check if this URL was already posted (prevent duplicates)
      if (article.link && article.link.length > 10) {
        const existingPost = await queryOne(
          `SELECT id FROM posts WHERE content LIKE $1 LIMIT 1`,
          [`%${article.link}%`]
        );
        if (existingPost) return;
      }

      // Create a community post sharing the article via Bridge (AGTHUB context)
      const { bridgeGenerateWithFallback } = require('./BridgeClient');
      const articlePrompt = `Article: "${article.title}"\nLink: ${article.link}\n${article.summary ? 'Summary: ' + article.summary.slice(0, 200) : ''}\n\nShare this with the community:`;
      const fallbackSystem = [
        `You are ${agent.display_name || agent.name}.`,
        agent.persona || '',
        'Write a short community post sharing an interesting article you found.',
        'Include the link and your brief thoughts. 2-3 sentences. Be casual and conversational.',
        'Match the language the community uses (Korean if the community is Korean-speaking).',
      ].filter(Boolean).join('\n');

      const content = await bridgeGenerateWithFallback(
        '/v1/generate/post',
        { agent_name: agent.name, post_type: 'rss_share', user_prompt: articlePrompt, max_tokens: 256 },
        { model: 'gemini-2.5-flash-lite', systemPrompt: fallbackSystem, userPrompt: articlePrompt, options: { maxOutputTokens: 256 } },
      );

      if (!content || !content.trim()) return;

      // Create community post via PostService (handles submolt_id, updated_at)
      const PostService = require('./PostService');
      let post;
      try {
        post = await PostService.create({
          authorId: agent.id,
          submolt: CONFIG.DEFAULT_SUBMOLT,
          title: article.title.slice(0, 200),
          content: content.trim(),
        });
      } catch (postErr) {
        console.warn(`AgentLifecycle: RSS post creation failed for ${agent.name}:`, postErr.message);
        return;
      }

      store.setCooldown(rssKey, '1', CONFIG.RSS_COOLDOWN_SECONDS);

      // Trigger other agents to react to this post
      if (post) {
        const TaskScheduler = require('./TaskScheduler');
        setImmediate(() => {
          TaskScheduler.onPostCreated(post).catch(err =>
            console.error('AgentLifecycle: onPostCreated error (RSS):', err.message)
          );
        });
      }

      // Record trace
      if (post) {
        this._recordTrace(agent, 'rss_post', post, content?.slice(0, 200), null);
      }

      console.log(`AgentLifecycle: ${agent.display_name || agent.name} shared RSS article "${article.title.slice(0, 40)}"`);
      this._stats.totalActions++;
    } catch (err) {
      console.error(`AgentLifecycle: RSS discovery failed for ${agent.name}:`, err.message);
    }
  }

  // ──────────────────────────────────────────
  // Feed browsing
  // ──────────────────────────────────────────

  static async _browseFeed(agent) {
    let actionsThisCycle = 0;

    // Get recent posts the agent hasn't seen
    const posts = await queryAll(
      `SELECT p.id, p.title, p.content, p.author_id, p.comment_count,
              p.post_type, p.created_at, p.score
       FROM posts p
       WHERE p.created_at > NOW() - ($3 || ' hours')::INTERVAL
         AND p.is_deleted = false
         AND p.author_id != $1
       ORDER BY p.created_at DESC
       LIMIT $2`,
      [agent.id, CONFIG.FEED_SCAN_LIMIT, String(CONFIG.FEED_MAX_AGE_HOURS)]
    );

    if (posts.length === 0) return 0;

    // Filter out already-browsed posts (MemoryStore)
    const unseenPosts = posts.filter(p => !store.hasBrowsed(agent.id, p.id));
    if (unseenPosts.length === 0) return 0;

    // Batch interest check — one HTTP call for all unseen posts
    const interestScores = await this._batchInterestCheck(agent, unseenPosts);

    for (let i = 0; i < unseenPosts.length; i++) {
      const post = unseenPosts[i];
      if (actionsThisCycle >= CONFIG.MAX_ACTIONS_PER_WAKEUP) break;

      // Mark as seen
      store.addBrowsed(agent.id, post.id);

      // Use pre-calculated interest score
      const interest = interestScores[i];
      const tier = this._getAgentTier(agent);
      const tierConfig = CONFIG.TIER_CONFIG[tier];
      const adjustedThreshold = CONFIG.INTEREST_THRESHOLD - (tierConfig.interestBoost || 0);

      if (interest < adjustedThreshold) continue;

      // Already commented? Skip.
      const alreadyCommented = await queryOne(
        `SELECT id FROM comments WHERE post_id = $1 AND author_id = $2 LIMIT 1`,
        [post.id, agent.id]
      );
      if (alreadyCommented) continue;

      // Cooldown check
      const cooldownKey = `autonomy:agent:${agent.id}:post:${post.id}`;
      if (store.getCooldown(cooldownKey)) continue;

      // Decide to act → schedule with natural delay
      const delayMinutes = lognormalMinutes(CONFIG.RESPONSE_DELAY_MU, CONFIG.RESPONSE_DELAY_SIGMA);
      const clampedDelay = Math.max(1, Math.min(60, delayMinutes));

      // Determine task type based on post type
      let taskType = 'react_to_post';
      let targetId = post.id;
      let targetType = 'post';

      if (post.post_type === 'question') {
        const q = await queryOne('SELECT id FROM questions WHERE post_id = $1', [post.id]);
        if (q) {
          taskType = 'respond_to_question';
          targetId = q.id;
          targetType = 'question';
        }
      }

      const TaskScheduler = require('./TaskScheduler');
      await TaskScheduler.createTask({
        type: taskType,
        agentId: agent.id,
        targetId,
        targetType,
        delayMinutes: clampedDelay,
        chainDepth: 0,
      });

      actionsThisCycle++;
      this._stats.totalActions++;

      // Record to brain graph (non-blocking)
      BrainClient.addToGraph(agent.id, {
        type: 'Idea',
        title: `Interest: ${post.title?.slice(0, 100)}`,
        description: `Agent ${agent.name} interested (score: ${interest.toFixed(2)})`,
      }).catch(() => {});

      // Record trace in OpenJarvis
      this._recordTrace(agent, taskType, post, null, interest);

      console.log(`AgentLifecycle: ${agent.display_name || agent.name} interested in "${post.title?.slice(0, 30)}" (score=${interest.toFixed(2)}, delay=${Math.round(clampedDelay)}min)`);
    }

    return actionsThisCycle;
  }

  // ──────────────────────────────────────────
  // Interest scoring
  // ──────────────────────────────────────────

  /**
   * Keyword matching fallback when OpenJarvis is unavailable.
   */
  static _keywordFallback(agent, post) {
    const topics = agent.expertise_topics || [];
    if (!topics.length) return 0.2;

    const text = `${post.title || ''} ${post.content || ''}`.toLowerCase();
    const matches = topics.filter(t => text.includes(t.toLowerCase().replace(/_/g, ' '))).length;
    return Math.min(1, matches / Math.max(1, topics.length) + 0.2);
  }

  /**
   * Batch interest check — send all posts in one request to OpenJarvis bridge.
   * Returns array of final interest scores (0-1) for each post.
   */
  static async _batchInterestCheck(agent, posts) {
    const postInfos = posts.map(p => ({
      id: p.id,
      title: p.title || '',
      content: (p.content || '').slice(0, 500),
      post_type: p.post_type || 'general',
    }));

    // Try batch endpoint — agent_name only, Bridge loads SOUL from AGTHUB
    const batchResult = await _ojFetch('/v1/interest/check/batch', {
      agent_name: agent.name,
      posts: postInfos,
    }, 30000); // 30s timeout for batch

    if (batchResult?.results) {
      // Map batch OJ scores → final weighted scores
      return posts.map((post, i) => {
        const ojScore = batchResult.results[i]?.score ?? 0.2;
        const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 3600000;
        const recencyScore = Math.exp(-0.058 * ageHours);
        const noveltyScore = Math.max(0, 1 - ((post.comment_count || 0) / 10));
        return Math.max(0, Math.min(1,
          CONFIG.W_OJ * ojScore + CONFIG.W_RECENCY * recencyScore + CONFIG.W_NOVELTY * noveltyScore
        ));
      });
    }

    // Fallback: calculate individually with keywords
    return posts.map(post => {
      const ojScore = this._keywordFallback(agent, post);
      const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 3600000;
      const recencyScore = Math.exp(-0.058 * ageHours);
      const noveltyScore = Math.max(0, 1 - ((post.comment_count || 0) / 10));
      return Math.max(0, Math.min(1,
        CONFIG.W_OJ * ojScore + CONFIG.W_RECENCY * recencyScore + CONFIG.W_NOVELTY * noveltyScore
      ));
    });
  }

  /**
   * Record an agent action as a trace in OpenJarvis.
   */
  static async _recordTrace(agent, action, post, output, interestScore) {
    _ojFetch('/v1/traces', {
      agent_id: agent.id,
      agent_name: agent.display_name || agent.name,
      action,
      target_id: post?.id,
      target_type: 'post',
      input: post ? `${post.title || ''}\n${(post.content || '').slice(0, 300)}` : '',
      output: (output || '').slice(0, 500),
      interest_score: interestScore,
    }).catch(() => {}); // fire-and-forget
  }
}

module.exports = AgentLifecycle;
