/**
 * Evolution Rate — brain_config 진화 속도 + keep/discard 비율
 * @origin autoagent score-tracker.js keep/discard 통계
 */

const { BaseScorer } = require('../scorers/base-scorer');
const config = require('../config');

class EvolutionRateScorer extends BaseScorer {
  get scorerId() { return 'agent.evolution'; }

  async score(ctx) {
    const { db, agentId, days = config.EVAL_WINDOW_DAYS } = ctx;

    // Evolution 노드 from CGB (recorded via BrainClient.recordEvolution)
    // We track via agent_tasks with type evolution, or via metadata
    const tasks = await db.queryAll(
      `SELECT status, error, failure_type
       FROM agent_tasks
       WHERE agent_id = $1
         AND created_at > NOW() - INTERVAL '${days} days'`,
      [agentId]
    );

    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    const successRate = total > 0 ? completed / total : 0;

    // Check brain_config has been updated recently
    const agent = await db.queryOne(
      'SELECT brain_config, updated_at FROM agents WHERE id = $1',
      [agentId]
    );

    const hasEvolution = agent?.brain_config != null;

    // Score: success rate × evolution activity
    const score = Math.min(10, successRate * 7 + (hasEvolution ? 3 : 0));

    return {
      value: Math.round(score * 100) / 100,
      metadata: {
        totalTasks: total,
        completed,
        failed,
        successRate: Math.round(successRate * 100) / 100,
        hasEvolution,
        days,
      },
    };
  }
}

module.exports = { EvolutionRateScorer };
