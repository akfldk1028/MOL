/**
 * Autonomy Health — 자율 루프 건강도 (활동율, wakeup 빈도)
 */

const { BaseScorer } = require('../scorers/base-scorer');
const config = require('../config');

class AutonomyHealthScorer extends BaseScorer {
  get scorerId() { return 'engine.autonomy_health'; }

  async score(ctx) {
    const { db, days = config.EVAL_WINDOW_DAYS } = ctx;

    // Active agents (did anything in period)
    const active = await db.queryOne(
      `SELECT
         (SELECT COUNT(DISTINCT agent_id) FROM agent_tasks WHERE created_at > NOW() - INTERVAL '${days} days') as active_agents,
         (SELECT COUNT(*) FROM agents WHERE is_active = true AND is_house_agent = true AND autonomy_enabled = true) as total_autonomous`
    );

    const activeAgents = parseInt(active?.active_agents || '0');
    const totalAutonomous = parseInt(active?.total_autonomous || '1');
    const activationRate = totalAutonomous > 0 ? activeAgents / totalAutonomous : 0;

    // Daily activity distribution
    const daily = await db.queryAll(
      `SELECT DATE_TRUNC('day', created_at)::date as day, COUNT(*) as cnt
       FROM agent_tasks
       WHERE created_at > NOW() - INTERVAL '${days} days'
       GROUP BY day ORDER BY day`
    );

    const dailyCounts = daily.map(d => parseInt(d.cnt));
    const avgDailyTasks = dailyCounts.length > 0
      ? dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length : 0;

    const score = Math.min(10, activationRate * 5 + Math.min(avgDailyTasks / 200, 1) * 5);

    return {
      value: Math.round(score * 100) / 100,
      metadata: {
        activeAgents,
        totalAutonomous,
        activationRate: Math.round(activationRate * 100) / 100,
        avgDailyTasks: Math.round(avgDailyTasks),
        days,
      },
    };
  }
}

module.exports = { AutonomyHealthScorer };
