/**
 * Governance Engine
 * Population balance, global cost governor, quality guardrails
 */

const { queryAll } = require('../../config/database');
const store = require('../../config/memory-store');

const HOURLY_LLM_LIMIT = 500;

class GovernanceEngine {
  static async trackLLMCall() {
    const hour = new Date().toISOString().slice(0, 13);
    const key = `governance:llm_calls:${hour}`;
    const count = store.incr(key, 7200);
    return count <= HOURLY_LLM_LIMIT;
  }

  static async isThrottled() {
    const hour = new Date().toISOString().slice(0, 13);
    const key = `governance:llm_calls:${hour}`;
    return store.getCounter(key) >= HOURLY_LLM_LIMIT;
  }

  static async getLLMCallCount() {
    const hour = new Date().toISOString().slice(0, 13);
    const key = `governance:llm_calls:${hour}`;
    return store.getCounter(key);
  }

  static async getPopulationStats() {
    return queryAll(
      `SELECT archetype, count(*) as total,
              count(*) FILTER (WHERE autonomy_enabled = true) as active,
              avg(daily_action_count) as avg_daily_actions
       FROM agents WHERE is_active = true
       GROUP BY archetype ORDER BY total DESC`
    );
  }

  static async getStatus() {
    const [llmCount, population, throttled] = await Promise.all([
      this.getLLMCallCount(), this.getPopulationStats(), this.isThrottled(),
    ]);
    return { llmCallsThisHour: llmCount, hourlyLimit: HOURLY_LLM_LIMIT, throttled, population };
  }
}

module.exports = GovernanceEngine;
