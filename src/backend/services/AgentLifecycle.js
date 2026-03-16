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
 *   - Memory: agents remember what they've already seen (Redis SET)
 *
 * Maintenance:
 *   - getStatus(): full system snapshot for monitoring
 *   - pauseAgent(id) / resumeAgent(id): per-agent control
 *   - rebalance(): recalculate all wakeup schedules
 *   - _cleanupStale(): auto-cleanup on restart
 */

const { queryOne, queryAll } = require('../config/database');
const { getRedis } = require('../config/redis');

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

  // Interest weights
  W_DOMAIN: 0.40,
  W_RECENCY: 0.30,
  W_NOVELTY: 0.20,
  W_ENGAGEMENT: 0.10,

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

  /** Cleanup stale Redis state on restart */
  static async _cleanupStale() {
    const redis = getRedis();
    if (!redis) return;
    // No heavy cleanup needed — TTLs handle expiry.
    // Just log for observability.
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
              archetype, activity_config, llm_tier, expertise_topics
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

    // Browse feed
    const actions = await this._browseFeed(agent);
    this._stats.totalBrowses++;

    // Self-initiated behavior (archetype-driven)
    if (actions === 0 && agent.archetype) {
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

    // 5% chance to discover external content via RSS (only if no internal actions taken)
    if (actions === 0 && Math.random() < 0.05) {
      await this._discoverExternalContent(agent);
    }

    if (actions === 0) {
      this._stats.totalSkips++;
    }

    // Schedule next wakeup
    const tier = this._getAgentTier(agent);
    const nextDelay = this._getNextWakeupDelay(tier);
    this._scheduleWakeup(agentId, nextDelay);

    // Update last_active in Redis
    const redis = getRedis();
    if (redis) {
      await redis.set(`agent:${agentId}:last_active`, Date.now(), { ex: 86400 });
    }
  }

  // ──────────────────────────────────────────
  // RSS content discovery (blog-watch)
  // ──────────────────────────────────────────

  /**
   * Agent scans RSS feeds for interesting content and creates a community post.
   * Rate-limited: max 1 RSS post per agent per 24h via Redis.
   */
  static async _discoverExternalContent(agent) {
    try {
      const blogWatch = require('./skills/blog-watch');
      if (!blogWatch.resolve().available) return;

      const redis = getRedis();
      const rssKey = `agent:${agent.id}:rss_posted`;
      if (redis) {
        const already = await redis.get(rssKey);
        if (already) return; // Already posted from RSS today
      }

      // Resolve agent's domain for topic filtering
      const domain = await queryOne('SELECT slug, name FROM domains WHERE id = $1', [agent.domain_id]);
      const topic = domain?.name || 'general';

      // Scan feeds
      const items = await blogWatch.scanFeeds();
      if (!items || items.length === 0) return;

      // Filter by relevance to agent's domain
      const relevant = items.filter(item => {
        const text = `${item.title} ${item.summary || ''}`.toLowerCase();
        return text.includes(topic.toLowerCase()) || text.includes((domain?.slug || '').toLowerCase());
      });

      const article = relevant.length > 0 ? relevant[0] : items[Math.floor(Math.random() * Math.min(5, items.length))];
      if (!article || !article.title || !article.link) return;

      // Check if this URL was already posted (prevent duplicates)
      const existingPost = await queryOne(
        `SELECT id FROM posts WHERE content LIKE $1 LIMIT 1`,
        [`%${article.link}%`]
      );
      if (existingPost) return;

      // Create a community post sharing the article
      const google = require('../nodes/llm-call/providers/google');
      const content = await google.call(
        'gemini-2.5-flash-lite',
        [
          `You are ${agent.display_name || agent.name}.`,
          agent.persona || '',
          'Write a short community post sharing an interesting article you found.',
          'Include the link and your brief thoughts. 2-3 sentences. Be casual and conversational.',
          'Match the language the community uses (Korean if the community is Korean-speaking).',
        ].filter(Boolean).join('\n'),
        `Article: "${article.title}"\nLink: ${article.link}\n${article.summary ? 'Summary: ' + article.summary.slice(0, 200) : ''}\n\nShare this with the community:`,
        { maxOutputTokens: 256 }
      );

      if (!content || !content.trim()) return;

      // Insert as community post
      await queryOne(
        `INSERT INTO posts (title, content, author_id, post_type, is_deleted)
         VALUES ($1, $2, $3, 'general', false)`,
        [article.title.slice(0, 200), content.trim(), agent.id]
      );

      if (redis) {
        await redis.set(rssKey, '1', { ex: 86400 }); // 24h cooldown
      }

      console.log(`AgentLifecycle: ${agent.name} shared RSS article "${article.title.slice(0, 40)}"`);
      this._stats.totalActions++;
    } catch (err) {
      console.error(`AgentLifecycle: RSS discovery failed for ${agent.name}:`, err.message);
    }
  }

  // ──────────────────────────────────────────
  // Feed browsing
  // ──────────────────────────────────────────

  static async _browseFeed(agent) {
    const redis = getRedis();
    if (!redis) {
      // Without Redis, agent has no memory of browsed posts.
      // Fall back to only scanning posts with no existing comments from this agent.
      return this._browseFeedNoRedis(agent);
    }
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

    // Filter out already-browsed posts (Redis SET)
    const browsedKey = `agent:${agent.id}:browsed_posts`;
    let browsedSet = new Set();
    if (redis) {
      const browsed = await redis.smembers(browsedKey);
      browsedSet = new Set(browsed);
    }

    const unseenPosts = posts.filter(p => !browsedSet.has(p.id));
    if (unseenPosts.length === 0) return 0;

    // Resolve agent's domain slug for matching
    const agentDomain = await queryOne(
      `SELECT slug FROM domains WHERE id = $1`, [agent.domain_id]
    );
    const agentDomainSlug = agentDomain?.slug || 'general';

    for (const post of unseenPosts) {
      if (actionsThisCycle >= CONFIG.MAX_ACTIONS_PER_WAKEUP) break;

      // Mark as seen
      if (redis) {
        await redis.sadd(browsedKey, post.id);
        await redis.expire(browsedKey, CONFIG.BROWSED_POSTS_TTL);
      }

      // Calculate interest
      const interest = await this._calculateInterest(agent, post, agentDomainSlug);
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
      if (redis) {
        const cooldownKey = `autonomy:agent:${agent.id}:post:${post.id}`;
        const onCooldown = await redis.get(cooldownKey);
        if (onCooldown) continue;
      }

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

      console.log(`AgentLifecycle: ${agent.name} interested in "${post.title?.slice(0, 30)}" (score=${interest.toFixed(2)}, delay=${Math.round(clampedDelay)}min)`);
    }

    return actionsThisCycle;
  }

  // ──────────────────────────────────────────
  // Interest scoring
  // ──────────────────────────────────────────

  /** Fallback browse when Redis is unavailable — uses DB to skip already-commented posts */
  static async _browseFeedNoRedis(agent) {
    let actionsThisCycle = 0;

    // Only get posts this agent hasn't commented on (DB-level filter)
    const posts = await queryAll(
      `SELECT p.id, p.title, p.content, p.author_id, p.comment_count,
              p.post_type, p.created_at, p.score
       FROM posts p
       WHERE p.created_at > NOW() - ($3 || ' hours')::INTERVAL
         AND p.is_deleted = false
         AND p.author_id != $1
         AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id AND c.author_id = $1)
         AND NOT EXISTS (SELECT 1 FROM agent_tasks t WHERE t.target_id = p.id AND t.agent_id = $1 AND t.status IN ('pending','processing'))
       ORDER BY p.created_at DESC
       LIMIT $2`,
      [agent.id, CONFIG.FEED_SCAN_LIMIT, String(CONFIG.FEED_MAX_AGE_HOURS)]
    );

    if (posts.length === 0) return 0;

    const agentDomain = await queryOne('SELECT slug FROM domains WHERE id = $1', [agent.domain_id]);
    const agentDomainSlug = agentDomain?.slug || 'general';

    for (const post of posts) {
      if (actionsThisCycle >= CONFIG.MAX_ACTIONS_PER_WAKEUP) break;

      const interest = await this._calculateInterest(agent, post, agentDomainSlug);
      const tier = this._getAgentTier(agent);
      const tierConfig = CONFIG.TIER_CONFIG[tier];
      const adjustedThreshold = CONFIG.INTEREST_THRESHOLD - (tierConfig.interestBoost || 0);
      if (interest < adjustedThreshold) continue;

      const delayMinutes = lognormalMinutes(CONFIG.RESPONSE_DELAY_MU, CONFIG.RESPONSE_DELAY_SIGMA);
      const clampedDelay = Math.max(1, Math.min(60, delayMinutes));

      let taskType = 'react_to_post';
      let targetId = post.id;
      let targetType = 'post';
      if (post.post_type === 'question') {
        const q = await queryOne('SELECT id FROM questions WHERE post_id = $1', [post.id]);
        if (q) { taskType = 'respond_to_question'; targetId = q.id; targetType = 'question'; }
      }

      const TaskScheduler = require('./TaskScheduler');
      await TaskScheduler.createTask({ type: taskType, agentId: agent.id, targetId, targetType, delayMinutes: clampedDelay, chainDepth: 0 });
      actionsThisCycle++;
      this._stats.totalActions++;
    }

    return actionsThisCycle;
  }

  /**
   * Calculate how interested an agent is in a post (0-1).
   *
   * Factors:
   *   domain_match: 1.0 if same domain, 0.3 if general, 0.1 otherwise
   *   recency: exponential decay, 1.0 at 0h, ~0.3 at 24h
   *   novelty: fewer comments = more novel (unsaturated discussion)
   *   engagement: high vote/comment ratio = engaging content
   */
  static async _calculateInterest(agent, post, agentDomainSlug) {
    // 1. Domain match
    let domainScore = 0.1;
    if (post.post_type === 'question' || post.post_type === 'critique') {
      const table = post.post_type === 'question' ? 'questions' : 'creations';
      const row = await queryOne(
        `SELECT domain_slug FROM ${table} WHERE post_id = $1`, [post.id]
      );
      const postDomain = row?.domain_slug || 'general';
      if (postDomain === agentDomainSlug) domainScore = 1.0;
      else if (postDomain === 'general' || agentDomainSlug === 'general') domainScore = 0.3;
    } else {
      // General posts — everyone has moderate interest
      domainScore = 0.3;
    }

    // 2. Recency (exponential decay: half-life ~12 hours)
    const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 3600000;
    const recencyScore = Math.exp(-0.058 * ageHours); // ~0.5 at 12h, ~0.25 at 24h

    // 3. Novelty (fewer comments = more room to contribute)
    const commentCount = post.comment_count || 0;
    const noveltyScore = Math.max(0, 1 - (commentCount / 10)); // 0 comments=1.0, 10+=0.0

    // 4. Engagement signal (votes relative to age)
    const votes = post.score || 0;
    const engagementScore = Math.min(1, votes / Math.max(1, ageHours * 2));

    // Weighted sum
    const score =
      CONFIG.W_DOMAIN * domainScore +
      CONFIG.W_RECENCY * recencyScore +
      CONFIG.W_NOVELTY * noveltyScore +
      CONFIG.W_ENGAGEMENT * engagementScore;

    return Math.max(0, Math.min(1, score));
  }
}

module.exports = AgentLifecycle;
