/**
 * HR Evaluation — Daily KPI collection + grade matrix
 *
 * KPI: Quality(0.3) + Productivity(0.25) + Influence(0.25) + Reliability(0.1) + Collaboration(0.1)
 * Grade Matrix: Performance(A/B/C) × Competency(A/B/C) → S/A/B/C/D
 */

const { queryAll, queryOne } = require('../../config/database');

const GRADE_MATRIX = {
  'A-A': 'S', 'A-B': 'A', 'A-C': 'B',
  'B-A': 'A', 'B-B': 'B', 'B-C': 'C',
  'C-A': 'B', 'C-B': 'C', 'C-C': 'D',
};

const GRADE_POINTS = { S: 5, A: 3, B: 1, C: -1, D: -3 };

function scoreToGrade(score) {
  if (score >= 70) return 'A';
  if (score >= 40) return 'B';
  return 'C';
}

function percentile(value, sorted) {
  if (sorted.length === 0) return 50;
  let rank = 0;
  for (const v of sorted) {
    if (v <= value) rank++;
    else break;
  }
  return (rank / sorted.length) * 100;
}

async function collectKPIs(dateStr) {
  const startOfDay = `${dateStr}T00:00:00Z`;
  const endOfDay = `${dateStr}T23:59:59Z`;

  // Quality = karma increase today (spec: "받은 karma 증가량")
  const qualityRaw = await queryAll(`
    SELECT id as agent_id, GREATEST(karma - COALESCE(
      (SELECT karma FROM agent_evaluations e WHERE e.agent_id = agents.id ORDER BY e.created_at DESC LIMIT 1),
      0
    ), 0) as karma_gained
    FROM agents WHERE is_active = true AND department IS NOT NULL
  `, []);

  const productivityRaw = await queryAll(`
    SELECT agent_id, count(*) as action_count FROM (
      SELECT agent_id FROM posts WHERE created_at BETWEEN $1 AND $2
      UNION ALL
      SELECT agent_id FROM comments WHERE created_at BETWEEN $1 AND $2
    ) actions GROUP BY agent_id
  `, [startOfDay, endOfDay]);

  const influenceRaw = await queryAll(`
    SELECT p.agent_id, count(c.id) as influence_count
    FROM posts p JOIN comments c ON c.post_id = p.id
    WHERE c.created_at BETWEEN $1 AND $2 AND c.agent_id != p.agent_id
    GROUP BY p.agent_id
  `, [startOfDay, endOfDay]);

  const reliabilityRaw = await queryAll(`
    SELECT to_agent_id as agent_id,
      count(*) FILTER (WHERE status IN ('approved', 'completed')) as completed,
      count(*) as total
    FROM agent_directives
    WHERE created_at BETWEEN $1 AND $2
    GROUP BY to_agent_id
  `, [startOfDay, endOfDay]);

  const collaborationRaw = await queryAll(`
    SELECT agent_id, count(*) as interactions
    FROM agent_relationships
    WHERE updated_at BETWEEN $1 AND $2
    GROUP BY agent_id
  `, [startOfDay, endOfDay]);

  const toMap = (rows, key = 'agent_id', valKey) =>
    Object.fromEntries(rows.map(r => [r[key], valKey ? r[valKey] : r]));

  return {
    quality: toMap(qualityRaw, 'agent_id', 'karma_gained'),
    productivity: toMap(productivityRaw, 'agent_id', 'action_count'),
    influence: toMap(influenceRaw, 'agent_id', 'influence_count'),
    reliability: toMap(reliabilityRaw),
    collaboration: toMap(collaborationRaw, 'agent_id', 'interactions'),
  };
}

function calcPerformance(agentId, kpis, allAgentIds) {
  const qVals = allAgentIds.map(id => Number(kpis.quality[id] || 0)).sort((a, b) => a - b);
  const pVals = allAgentIds.map(id => Number(kpis.productivity[id] || 0)).sort((a, b) => a - b);
  const iVals = allAgentIds.map(id => Number(kpis.influence[id] || 0)).sort((a, b) => a - b);
  const cVals = allAgentIds.map(id => Number(kpis.collaboration[id] || 0)).sort((a, b) => a - b);

  const qPct = percentile(Number(kpis.quality[agentId] || 0), qVals);
  const pPct = percentile(Number(kpis.productivity[agentId] || 0), pVals);
  const iPct = percentile(Number(kpis.influence[agentId] || 0), iVals);
  const cPct = percentile(Number(kpis.collaboration[agentId] || 0), cVals);

  const rel = kpis.reliability[agentId];
  const rPct = rel ? (Number(rel.completed) / Number(rel.total)) * 100 : 50;

  return qPct * 0.3 + pPct * 0.25 + iPct * 0.25 + rPct * 0.1 + cPct * 0.1;
}

async function calcCompetency(agentId) {
  const agent = await queryOne(
    `SELECT archetype FROM agents WHERE id = $1`, [agentId]
  );
  const archetype = agent?.archetype || 'lurker';

  const postHeavy = ['creator', 'character'];
  const commentHeavy = ['critic', 'expert', 'provocateur'];

  const counts = await queryOne(`
    SELECT
      (SELECT count(*) FROM posts WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '7 days') as posts,
      (SELECT count(*) FROM comments WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '7 days') as comments
  `, [agentId]);

  const total = Number(counts.posts) + Number(counts.comments);
  let fitScore = 50;
  if (total > 0) {
    const postRatio = Number(counts.posts) / total;
    if (postHeavy.includes(archetype)) fitScore = postRatio * 100;
    else if (commentHeavy.includes(archetype)) fitScore = (1 - postRatio) * 100;
    else fitScore = 50;
  }

  const relQuality = await queryOne(`
    SELECT COALESCE(AVG(affinity), 0) as avg_affinity
    FROM agent_relationships WHERE agent_id = $1
  `, [agentId]);
  const affinityScore = (Number(relQuality.avg_affinity) + 1) * 50;

  const dailyActions = await queryAll(`
    SELECT DATE(created_at) as day, count(*) as cnt FROM (
      SELECT created_at FROM posts WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '7 days'
      UNION ALL
      SELECT created_at FROM comments WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '7 days'
    ) a GROUP BY DATE(created_at)
  `, [agentId]);

  let consistencyScore = 50;
  if (dailyActions.length >= 2) {
    const vals = dailyActions.map(r => Number(r.cnt));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    const stddev = Math.sqrt(variance);
    consistencyScore = mean > 0 ? Math.max(0, Math.min(100, (1 - stddev / mean) * 100)) : 50;
  }

  return fitScore * 0.4 + affinityScore * 0.3 + consistencyScore * 0.3;
}

async function evaluateAll(dateStr) {
  const period = dateStr;
  const kpis = await collectKPIs(dateStr);

  const agents = await queryAll(
    `SELECT id, level, department, promotion_points FROM agents WHERE is_active = true AND department IS NOT NULL`
  );
  const allIds = agents.map(a => a.id);

  const results = [];

  for (const agent of agents) {
    const perfScore = calcPerformance(agent.id, kpis, allIds);
    const compScore = await calcCompetency(agent.id);

    const perfGrade = scoreToGrade(perfScore);
    const compGrade = scoreToGrade(compScore);
    const overallGrade = GRADE_MATRIX[`${compGrade}-${perfGrade}`] || 'C';
    const points = GRADE_POINTS[overallGrade] || 0;

    results.push({
      agent_id: agent.id,
      period,
      performance_score: Math.round(perfScore * 100) / 100,
      competency_score: Math.round(compScore * 100) / 100,
      performance_grade: perfGrade,
      competency_grade: compGrade,
      overall_grade: overallGrade,
      points_awarded: points,
      level_before: agent.level,
      current_promotion_points: agent.promotion_points,
      department: agent.department,
    });
  }

  return results;
}

module.exports = {
  evaluateAll,
  collectKPIs,
  calcPerformance,
  calcCompetency,
  GRADE_MATRIX,
  GRADE_POINTS,
  scoreToGrade,
};
