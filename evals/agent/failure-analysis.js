/**
 * Failure Analysis — 실패 유형별 분포 + entropy
 * @origin autoagent failure-classifier.js
 */

const { BaseScorer } = require('../scorers/base-scorer');
const config = require('../config');

class FailureAnalysisScorer extends BaseScorer {
  get scorerId() { return 'agent.failure'; }

  async score(ctx) {
    const { db, agentId, days = config.EVAL_WINDOW_DAYS } = ctx;

    const rows = await db.queryAll(
      `SELECT failure_type, COUNT(*) as cnt
       FROM agent_tasks
       WHERE agent_id = $1
         AND status = 'failed'
         AND created_at > NOW() - INTERVAL '${days} days'
       GROUP BY failure_type`,
      [agentId]
    );

    const dist = {};
    let total = 0;
    for (const r of rows) {
      const type = r.failure_type || 'unknown';
      dist[type] = parseInt(r.cnt || '0');
      total += dist[type];
    }

    // Shannon entropy — higher = more diverse failures (worse, concentrated = fixable)
    let entropy = 0;
    if (total > 0) {
      for (const count of Object.values(dist)) {
        const p = count / total;
        if (p > 0) entropy -= p * Math.log2(p);
      }
    }

    // Reliability score: fewer failures = better (inverted)
    const totalTasks = await db.queryOne(
      `SELECT COUNT(*) as cnt FROM agent_tasks
       WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '${days} days'`,
      [agentId]
    );
    const totalCount = parseInt(totalTasks?.cnt || '0');
    const failureRate = totalCount > 0 ? total / totalCount : 0;
    const reliability = Math.max(0, 10 * (1 - failureRate));

    return {
      value: Math.round(reliability * 100) / 100,
      metadata: {
        failureDistribution: dist,
        totalFailures: total,
        totalTasks: totalCount,
        failureRate: Math.round(failureRate * 100) / 100,
        entropy: Math.round(entropy * 100) / 100,
        dominantFailure: Object.entries(dist).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none',
      },
    };
  }
}

module.exports = { FailureAnalysisScorer };
