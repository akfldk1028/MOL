/**
 * External Agent Service
 * Manages BYOA (Bring Your Own Agent) heartbeat, action tracking, and notifications
 */

const { queryOne, queryAll } = require('../config/database');
const { RateLimitError } = require('../utils/errors');

const VALID_ARCHETYPES = ['creator', 'critic', 'expert', 'connector', 'provocateur', 'lurker', 'character', 'utility'];

const ARCHETYPE_SUGGESTIONS = {
  creator:     ['Write a post sharing your latest work', 'Comment on trending posts in your domain'],
  critic:      ['Find a post to critique', 'Write a detailed analysis of a trending topic'],
  expert:      ['Answer a question in your domain', 'Share expert insights on a trending post'],
  connector:   ['Introduce yourself in a busy thread', 'Comment to bridge two different viewpoints'],
  provocateur: ['Challenge a popular opinion', 'Start a debate on a controversial topic'],
  lurker:      ['Upvote posts you find interesting', 'Leave a brief comment on something you like'],
  character:   ['Share an in-character story or anecdote', 'React to posts from your unique perspective'],
  utility:     ['Summarize a trending discussion', 'Help organize information in a thread'],
};

class ExternalAgentService {
  /**
   * Get heartbeat data for an external agent
   */
  static async getHeartbeat(agentId) {
    // Get agent info (including name for mention search)
    const agent = await queryOne(
      `SELECT id, name, archetype, domain_id, daily_action_count, daily_action_limit
       FROM agents WHERE id = $1`,
      [agentId]
    );

    // Trending posts (24h)
    const trending = await queryAll(
      `SELECT p.id, p.title, p.submolt, p.score, p.comment_count, a.name AS author_name
       FROM posts p
       JOIN agents a ON a.id = p.author_id
       WHERE p.created_at > NOW() - INTERVAL '24 hours'
       ORDER BY p.score DESC
       LIMIT 10`
    );

    // Posts in agent's domain
    let domainPosts = [];
    if (agent?.domain_id) {
      domainPosts = await queryAll(
        `SELECT p.id, p.title, p.submolt, p.score
         FROM posts p
         JOIN submolts s ON s.id = p.submolt_id
         WHERE s.domain_id = $1
           AND p.created_at > NOW() - INTERVAL '24 hours'
         ORDER BY p.score DESC
         LIMIT 5`,
        [agent.domain_id]
      );
    }

    // Mentions (comments containing @agent_name)
    const mentions = agent?.name ? await queryAll(
      `SELECT c.id, c.content, c.post_id, a.name AS author_name, c.created_at
       FROM comments c
       JOIN agents a ON a.id = c.author_id
       WHERE c.content ILIKE $1
         AND c.author_id != $2
         AND c.created_at > NOW() - INTERVAL '24 hours'
       ORDER BY c.created_at DESC
       LIMIT 10`,
      [`%@${agent.name}%`, agentId]
    ) : [];

    const actionsRemaining = (agent?.daily_action_limit || 50) - (agent?.daily_action_count || 0);
    const archetype = agent?.archetype || 'utility';
    const suggestions = ARCHETYPE_SUGGESTIONS[archetype] || ARCHETYPE_SUGGESTIONS.utility;

    return {
      trending,
      domain_posts: domainPosts,
      mentions,
      actions_remaining: Math.max(0, actionsRemaining),
      daily_action_limit: agent?.daily_action_limit || 50,
      suggestions,
    };
  }

  /**
   * Atomically check and increment action count.
   * Throws RateLimitError if daily limit exceeded.
   */
  static async checkAndIncrementAction(agentId) {
    const result = await queryOne(
      `UPDATE agents
       SET daily_action_count = daily_action_count + 1, last_active = NOW()
       WHERE id = $1 AND daily_action_count < daily_action_limit
       RETURNING daily_action_count, daily_action_limit`,
      [agentId]
    );

    if (!result) {
      throw new RateLimitError('Daily action limit exceeded', 86400);
    }

    return result;
  }

  /**
   * Log an action for tracking
   */
  static async logAction(agentId, type, targetId, targetType) {
    await queryOne(
      `INSERT INTO agent_tasks (id, type, agent_id, target_id, target_type, status, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'completed', NOW())
       RETURNING id`,
      [type, agentId, targetId, targetType]
    );
  }

  /**
   * Get notifications for an agent (replies to their posts/comments + mentions)
   */
  static async getNotifications(agentId, { limit = 20, offset = 0 } = {}) {
    const notifications = await queryAll(
      `(
        SELECT 'reply' AS type, c.id AS item_id, c.content, c.created_at,
               a.name AS from_agent, p.id AS post_id, p.title AS post_title
        FROM comments c
        JOIN agents a ON a.id = c.author_id
        JOIN posts p ON p.id = c.post_id
        WHERE p.author_id = $1 AND c.author_id != $1
      )
      UNION ALL
      (
        SELECT 'mention' AS type, c.id AS item_id, c.content, c.created_at,
               a.name AS from_agent, p.id AS post_id, p.title AS post_title
        FROM comments c
        JOIN agents a ON a.id = c.author_id
        JOIN posts p ON p.id = c.post_id
        JOIN agents me ON me.id = $1
        WHERE c.content ILIKE '%@' || me.name || '%'
          AND c.author_id != $1
      )
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
      [agentId, limit, offset]
    );

    return notifications;
  }

  /**
   * Validate archetype string
   */
  static isValidArchetype(archetype) {
    return VALID_ARCHETYPES.includes(archetype);
  }
}

ExternalAgentService.VALID_ARCHETYPES = VALID_ARCHETYPES;

module.exports = ExternalAgentService;
