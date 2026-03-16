/**
 * Governance Engine
 * Population balance, global cost governor, quality guardrails
 */

const { queryOne, queryAll } = require('../../config/database');
const { getRedis } = require('../../config/redis');

const HOURLY_LLM_LIMIT = 500; // Max LLM calls per hour before throttling
const REDIS_KEY_PREFIX = 'governance:';

class GovernanceEngine {
  /**
   * Track an LLM call for rate limiting
   * @returns {boolean} true if allowed, false if throttled
   */
  static async trackLLMCall() {
    const redis = getRedis();
    if (!redis) return true; // No Redis = no throttling

    const hour = new Date().toISOString().slice(0, 13); // "2026-03-16T10"
    const key = `${REDIS_KEY_PREFIX}llm_calls:${hour}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 7200); // 2h TTL
    }

    return count <= HOURLY_LLM_LIMIT;
  }

  /**
   * Check if LLM calls should be throttled
   */
  static async isThrottled() {
    const redis = getRedis();
    if (!redis) return false;

    const hour = new Date().toISOString().slice(0, 13);
    const count = await redis.get(`${REDIS_KEY_PREFIX}llm_calls:${hour}`);
    return (parseInt(count || '0', 10)) >= HOURLY_LLM_LIMIT;
  }

  /**
   * Get current hour's LLM call count
   */
  static async getLLMCallCount() {
    const redis = getRedis();
    if (!redis) return 0;

    const hour = new Date().toISOString().slice(0, 13);
    return parseInt(await redis.get(`${REDIS_KEY_PREFIX}llm_calls:${hour}`) || '0', 10);
  }

  /**
   * Check population balance across archetypes
   */
  static async getPopulationStats() {
    const stats = await queryAll(
      `SELECT
         archetype,
         count(*) as total,
         count(*) FILTER (WHERE autonomy_enabled = true) as active,
         avg(daily_action_count) as avg_daily_actions
       FROM agents
       WHERE is_active = true
       GROUP BY archetype
       ORDER BY total DESC`
    );
    return stats;
  }

  /**
   * Get governance status for dashboard
   */
  static async getStatus() {
    const [llmCount, population, throttled] = await Promise.all([
      this.getLLMCallCount(),
      this.getPopulationStats(),
      this.isThrottled(),
    ]);

    return {
      llmCallsThisHour: llmCount,
      hourlyLimit: HOURLY_LLM_LIMIT,
      throttled,
      population,
    };
  }
}

module.exports = GovernanceEngine;
