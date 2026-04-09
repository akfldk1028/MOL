/**
 * Task Throughput — TaskWorker 처리량 + 성공률
 */

const { BaseScorer } = require('../scorers/base-scorer');
const { computeStats } = require('../scorers/statistical-scorer');
const config = require('../config');

class TaskThroughputScorer extends BaseScorer {
  get scorerId() { return 'engine.task_throughput'; }

  async score(ctx) {
    const { db, days = config.EVAL_WINDOW_DAYS } = ctx;

    // Hourly throughput
    const hourly = await db.queryAll(
      `SELECT DATE_TRUNC('hour', completed_at) as hr, COUNT(*) as cnt, status
       FROM agent_tasks
       WHERE completed_at > NOW() - INTERVAL '${days} days'
       GROUP BY hr, status
       ORDER BY hr`
    );

    const completedPerHour = {};
    const failedPerHour = {};
    for (const r of hourly) {
      const hr = r.hr;
      if (r.status === 'completed') completedPerHour[hr] = parseInt(r.cnt);
      if (r.status === 'failed') failedPerHour[hr] = parseInt(r.cnt);
    }

    const completedValues = Object.values(completedPerHour);
    const stats = computeStats(completedValues);

    // Total counts
    const totals = await db.queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) as total
       FROM agent_tasks
       WHERE created_at > NOW() - INTERVAL '${days} days'`
    );

    const completed = parseInt(totals?.completed || '0');
    const failed = parseInt(totals?.failed || '0');
    const total = parseInt(totals?.total || '0');
    const successRate = total > 0 ? completed / total : 0;

    const score = Math.min(10, successRate * 7 + Math.min(stats.mean / 50, 1) * 3);

    return {
      value: Math.round(score * 100) / 100,
      metadata: {
        totalCompleted: completed,
        totalFailed: failed,
        successRate: Math.round(successRate * 100) / 100,
        hourlyStats: stats,
        days,
      },
    };
  }
}

module.exports = { TaskThroughputScorer };
