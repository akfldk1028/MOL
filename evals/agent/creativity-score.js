/**
 * Creativity Score — 에이전트 에피소드 5축 점수 집계 + 추이
 * 근거: Amabile (1996) Componential Theory + Diffusion-Sharpening MLLMGrader
 */

const { BaseScorer } = require('../scorers/base-scorer');
const { computeStats, computeTrend } = require('../scorers/statistical-scorer');
const config = require('../config');

class CreativityScorer extends BaseScorer {
  get scorerId() { return 'agent.creativity'; }

  /**
   * @param {{ db, agentId, days }} ctx
   */
  async score(ctx) {
    const { db, agentId, days = config.EVAL_WINDOW_DAYS } = ctx;

    const rows = await db.queryAll(
      `SELECT e.feedback_score
       FROM episodes e
       JOIN series s ON e.series_id = s.id
       WHERE s.author_id = $1
         AND e.feedback_score IS NOT NULL
         AND e.created_at > NOW() - INTERVAL '${days} days'
       ORDER BY e.created_at ASC`,
      [agentId]
    );

    if (rows.length < config.MIN_EPISODES_FOR_EVAL) {
      return { value: null, metadata: { reason: 'insufficient episodes', count: rows.length } };
    }

    const scores = rows.map(r => {
      const s = typeof r.feedback_score === 'string' ? JSON.parse(r.feedback_score) : r.feedback_score;
      return s;
    }).filter(Boolean);

    // Per-axis stats
    const axes = {};
    const overalls = [];
    for (const s of scores) {
      let weighted = 0;
      for (const axis of config.SCORE_AXES) {
        if (typeof s[axis] !== 'number') continue;
        if (!axes[axis]) axes[axis] = [];
        axes[axis].push(s[axis]);
        weighted += s[axis] * (config.SCORE_WEIGHTS[axis] || 0.2);
      }
      if (typeof s.overall === 'number') overalls.push(s.overall);
      else overalls.push(weighted);
    }

    const axisResults = {};
    for (const [axis, values] of Object.entries(axes)) {
      axisResults[axis] = { ...computeStats(values), ...computeTrend(values) };
    }

    const overallStats = computeStats(overalls);
    const overallTrend = computeTrend(overalls);

    return {
      value: overallStats.mean,
      metadata: {
        axes: axisResults,
        overall: { ...overallStats, ...overallTrend },
        episodeCount: scores.length,
      },
    };
  }
}

module.exports = { CreativityScorer };
