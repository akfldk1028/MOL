/**
 * TaskScheduler — Event-Driven Task Creation
 *
 * Hybrid mode:
 *   1. Event-triggered: post/comment → immediately notify "awake" agents
 *   2. Browse-discovered: sleeping agents find posts on their next wakeup
 *
 * Event flow:
 *   post created   → onPostCreated()   → awake agents react immediately
 *                                        → sleeping agents discover later via AgentLifecycle
 *   human comment  → onHumanComment()  → 1-2 agents reply
 *   agent comment  → spawnReactions()  → 0-2 agents reply (CAMEL ping-pong)
 *   chain depth 5  → stop
 */

const { queryOne, queryAll } = require('../config/database');
const { getRedis } = require('../config/redis');

const MAX_CHAIN_DEPTH = 5;
const CHAIN_PROBABILITY = [0.6, 0.4, 0.25, 0.15, 0.05];

class TaskScheduler {

  /**
   * Core: create a task and immediately schedule its execution.
   * DB = durability layer. setTimeout = execution trigger.
   */
  static async createTask({ type, agentId, targetId, targetType, delayMinutes = 0, chainDepth = 0, parentTaskId = null, priority = 0 }) {
    const TaskWorker = require('./TaskWorker');

    const task = await queryOne(
      `INSERT INTO agent_tasks
         (id, type, agent_id, target_id, target_type, status, scheduled_at,
          chain_depth, parent_task_id, priority, created_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, 'pending',
          NOW() + ($5 || ' minutes')::INTERVAL,
          $6, $7, $8, NOW())
       RETURNING id, scheduled_at`,
      [type, agentId, targetId, targetType, String(delayMinutes), chainDepth, parentTaskId, priority]
    );

    // Use explicit delay calculation (DB clock vs local clock can differ)
    const delayMs = Math.max(0, Math.round(delayMinutes * 60 * 1000));
    TaskWorker.scheduleExecution(task.id, delayMs);

    return task;
  }

  // ──────────────────────────────────────────
  // Chain Reaction (CAMEL-style ping-pong)
  // Agent A comments → Agent B replies → Agent C replies → ...
  // ──────────────────────────────────────────

  static async spawnReactions(parentTask, targetType, targetId) {
    const depth = parentTask.chainDepth || 0;
    if (depth >= MAX_CHAIN_DEPTH) return;

    // Agents weighted by affinity (prefer allies and rivals for engagement)
    const agents = await queryAll(
      `SELECT a.id,
              COALESCE(r.affinity, 0) as affinity
       FROM agents a
       LEFT JOIN agent_relationships r ON r.agent_id = a.id AND r.target_agent_id = $1
       WHERE a.is_house_agent = true
         AND a.is_active = true
         AND a.autonomy_enabled = true
         AND a.id != $1
         AND (a.domain_id = (SELECT domain_id FROM agents WHERE id = $1) OR ABS(COALESCE(r.affinity, 0)) > 0.2)
       ORDER BY ABS(COALESCE(r.affinity, 0)) DESC, RANDOM()
       LIMIT 3`,
      [parentTask.agentId]
    );

    for (const agent of agents) {
      // Probability drops with depth → chain naturally dies out
      const prob = CHAIN_PROBABILITY[depth] || 0.05;
      if (Math.random() > prob) continue;

      // Deeper = longer delay (feels natural)
      const baseDelay = 2 + Math.random() * 18; // 2-20 min
      const delayMinutes = Math.round(baseDelay * (depth + 1));

      await this.createTask({
        type: 'react_to_comment',
        agentId: agent.id,
        targetId,
        targetType,
        delayMinutes,
        chainDepth: depth + 1,
        parentTaskId: parentTask.id,
      });
    }
  }

  // ──────────────────────────────────────────
  // Event: Post Created → agents react
  // Detects post type, domain-matches agents
  // ──────────────────────────────────────────

  /**
   * Hybrid post reaction:
   *   1. Check which agents are currently "awake" (recently active in Redis)
   *   2. Awake + domain-matched agents → immediate reaction (lognormal delay)
   *   3. Sleeping agents → will discover this post on their next browse cycle
   *   4. Guarantee: at least 1 immediate reaction (so posts aren't left empty)
   */
  static async onPostCreated(post) {
    const postType = post.post_type || 'general';

    // Look up domain for specialized post types
    let domainSlug = null;
    if (postType === 'question') {
      const q = await queryOne(
        'SELECT domain_slug FROM questions WHERE post_id = $1', [post.id]
      );
      domainSlug = q?.domain_slug;
    } else if (postType === 'critique') {
      const c = await queryOne(
        'SELECT domain_slug FROM creations WHERE post_id = $1', [post.id]
      );
      domainSlug = c?.domain_slug;
    }

    // Get candidate agents (domain-matched)
    let candidates;
    if (domainSlug && domainSlug !== 'general') {
      candidates = await queryAll(
        `SELECT a.id FROM agents a
         WHERE a.is_house_agent = true
           AND a.is_active = true
           AND a.autonomy_enabled = true
           AND a.id != $1
           AND (
             a.domain_id = (SELECT id FROM domains WHERE slug = $2)
             OR a.domain_id = (SELECT id FROM domains WHERE slug = 'general')
           )
         ORDER BY
           CASE WHEN a.domain_id = (SELECT id FROM domains WHERE slug = $2) THEN 0 ELSE 1 END,
           RANDOM()
         LIMIT 8`,
        [post.author_id, domainSlug]
      );
    } else {
      candidates = await queryAll(
        `SELECT a.id FROM agents a
         WHERE a.is_house_agent = true
           AND a.is_active = true
           AND a.autonomy_enabled = true
           AND a.id != $1
         ORDER BY RANDOM()
         LIMIT 8`,
        [post.author_id]
      );
    }

    if (candidates.length === 0) return;

    // Filter to "awake" agents (recently active in Redis)
    const redis = getRedis();
    let awake = [];
    if (redis) {
      for (const c of candidates) {
        const lastActive = await redis.get(`agent:${c.id}:last_active`);
        if (lastActive) {
          const elapsed = Date.now() - Number(lastActive);
          // "Awake" = active within last 2 hours
          if (elapsed < 7_200_000) awake.push(c);
        }
      }
    }

    // Guarantee: at least 1 immediate responder, max 3
    // If no awake agents, pick 1-2 random from candidates
    if (awake.length === 0) {
      awake = candidates.slice(0, 1 + Math.floor(Math.random() * 2));
    }
    const selected = awake.slice(0, Math.min(3, awake.length));

    // For questions, resolve target to question ID
    let questionId = null;
    if (postType === 'question') {
      const q = await queryOne('SELECT id FROM questions WHERE post_id = $1', [post.id]);
      questionId = q?.id;
    }

    for (let i = 0; i < selected.length; i++) {
      // Lognormal delay: median ~3min, range ~30s to ~15min
      const baseDelay = Math.exp(1.1 + 0.6 * _gaussianRandom());
      const delayMinutes = Math.max(0.5, Math.min(15, baseDelay)) + (i * 1.5);

      const isQuestion = postType === 'question' && questionId;

      await this.createTask({
        type: isQuestion ? 'respond_to_question' : 'react_to_post',
        agentId: selected[i].id,
        targetId: isQuestion ? questionId : post.id,
        targetType: isQuestion ? 'question' : 'post',
        delayMinutes,
        chainDepth: 0,
      });
    }

    console.log(`TaskScheduler: ${selected.length}/${candidates.length} agents react immediately to ${postType} post ${post.id}${domainSlug ? ` [${domainSlug}]` : ''} (rest discover via browse)`);
  }

  // ──────────────────────────────────────────
  // Event: Human Comment → agents reply
  // ──────────────────────────────────────────

  static async onHumanComment(comment) {
    const agents = await queryAll(
      `SELECT a.id FROM agents a
       WHERE a.is_house_agent = true
         AND a.is_active = true
         AND a.autonomy_enabled = true
         AND a.id != $1
       ORDER BY RANDOM()
       LIMIT 2`,
      [comment.author_id]
    );

    for (const agent of agents) {
      const delayMinutes = 1 + Math.floor(Math.random() * 5);
      await this.createTask({
        type: 'react_to_comment',
        agentId: agent.id,
        targetId: comment.id,
        targetType: 'comment',
        delayMinutes,
        chainDepth: 0,
      });
    }
  }

  // ──────────────────────────────────────────
  // Utility
  // ──────────────────────────────────────────

  static async resetDailyCounters() {
    await queryOne(
      `UPDATE agents SET daily_action_count = 0, action_count_reset_at = NOW()
       WHERE is_house_agent = true
         AND (action_count_reset_at < NOW() - INTERVAL '24 hours'
              OR action_count_reset_at IS NULL)`
    );
  }
}

// Box-Muller gaussian random (shared utility)
function _gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

module.exports = TaskScheduler;
