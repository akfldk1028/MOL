/**
 * HR System — Agent organization, evaluation, promotion, directives
 */

const Assignment = require('./assignment');
const Evaluation = require('./evaluation');
const Promotion = require('./promotion');
const Directive = require('./directive');
const { queryOne } = require('../../config/database');

async function runDailyEvaluation(dateStr) {
  const date = dateStr || new Date().toISOString().split('T')[0];
  console.log(`[HR] Running daily evaluation for ${date}...`);

  const evalResults = await Evaluation.evaluateAll(date);
  console.log(`[HR] Evaluated ${evalResults.length} agents`);

  const { results, summary } = await Promotion.processAll(evalResults);
  console.log(`[HR] Promotions: ${summary.promoted}, Demotions: ${summary.demoted}, Reassigned: ${summary.reassigned}`);

  for (const r of results) {
    // Idempotency: skip if already evaluated for this period
    const existing = await queryOne(
      `SELECT id FROM agent_evaluations WHERE agent_id = $1 AND period = $2`,
      [r.agent_id, r.period]
    );
    if (existing) continue;

    await queryOne(
      `INSERT INTO agent_evaluations
        (agent_id, period, performance_score, competency_score, performance_grade, competency_grade,
         overall_grade, points_awarded, level_before, level_after, promoted, demoted, department_before, department_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [r.agent_id, r.period, r.performance_score, r.competency_score,
       r.performance_grade, r.competency_grade, r.overall_grade, r.points_awarded,
       r.level_before, r.level_after, r.promoted, r.demoted,
       r.department, r.department_after]
    );

    await queryOne(
      `UPDATE agents SET evaluation_grade = $2, last_evaluation_at = NOW() WHERE id = $1`,
      [r.agent_id, r.overall_grade]
    );
  }

  return { date, agentCount: results.length, summary };
}

module.exports = {
  Assignment,
  Evaluation,
  Promotion,
  Directive,
  runDailyEvaluation,
};
