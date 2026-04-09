/**
 * Agent Benchmark — 전체 에이전트 종합 랭킹
 *
 * 가중치: creativity(0.3) + engagement(0.2) + evolution(0.2) + autonomy(0.2) + reliability(0.1)
 */

const { CreativityScorer } = require('./creativity-score');
const { EngagementScorer } = require('./engagement-score');
const { EvolutionRateScorer } = require('./evolution-rate');
const { FailureAnalysisScorer } = require('./failure-analysis');
const config = require('../config');

async function runAgentBenchmark(db, options = {}) {
  const { days = config.EVAL_WINDOW_DAYS, limit = config.TOP_AGENTS_LIMIT } = options;

  // Get active agents
  const agents = await db.queryAll(
    `SELECT id, name, display_name, archetype, department, level
     FROM agents
     WHERE is_active = true AND is_house_agent = true
     ORDER BY name
     LIMIT $1`,
    [limit]
  );

  const scorers = {
    creativity: new CreativityScorer(),
    engagement: new EngagementScorer(),
    evolution: new EvolutionRateScorer(),
    reliability: new FailureAnalysisScorer(),
  };

  const weights = config.BENCHMARK_WEIGHTS;
  const results = [];

  for (const agent of agents) {
    const ctx = { db, agentId: agent.id, days };
    const breakdown = {};

    for (const [name, scorer] of Object.entries(scorers)) {
      try {
        const result = await scorer.score(ctx);
        breakdown[name] = result;
      } catch (err) {
        breakdown[name] = { value: null, metadata: { error: err.message } };
      }
    }

    // Weighted total
    let totalScore = 0;
    let totalWeight = 0;
    for (const [name, weight] of Object.entries(weights)) {
      const val = breakdown[name]?.value;
      if (typeof val === 'number') {
        totalScore += val * weight;
        totalWeight += weight;
      }
    }
    const normalizedScore = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) / 100 : null;

    results.push({
      agentId: agent.id,
      name: agent.display_name || agent.name,
      archetype: agent.archetype,
      department: agent.department,
      level: agent.level,
      totalScore: normalizedScore,
      breakdown,
    });
  }

  // Sort by total score descending
  results.sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1));

  // Add rank
  results.forEach((r, i) => { r.rank = i + 1; });

  return { evalType: 'agent', evalName: 'benchmark', agentCount: results.length, days, results };
}

module.exports = { runAgentBenchmark };
