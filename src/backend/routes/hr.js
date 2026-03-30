/**
 * HR Routes
 * /api/v1/hr/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireInternalSecret } = require('../middleware/auth');
const { success } = require('../utils/response');
const { queryAll, queryOne } = require('../config/database');
const HRSystem = require('../agent-system/hr');

const router = Router();

/**
 * GET /hr/organization
 */
router.get('/organization', asyncHandler(async (req, res) => {
  const agents = await queryAll(
    `SELECT id, name, display_name, avatar_url, level, department, team, title, evaluation_grade, karma
     FROM agents WHERE is_active = true AND department IS NOT NULL
     ORDER BY department, team, level ASC, karma DESC`
  );

  const org = {};
  for (const agent of agents) {
    if (!org[agent.department]) org[agent.department] = {};
    if (!org[agent.department][agent.team]) org[agent.department][agent.team] = [];
    org[agent.department][agent.team].push(agent);
  }

  success(res, { organization: org, totalAgents: agents.length });
}));

/**
 * GET /hr/dashboard
 */
router.get('/dashboard', asyncHandler(async (req, res) => {
  const latestDate = await queryOne(
    `SELECT MAX(period) as latest FROM agent_evaluations`
  );

  const period = latestDate?.latest;

  const gradeDistribution = period ? await queryAll(
    `SELECT overall_grade, count(*) as cnt FROM agent_evaluations WHERE period = $1 GROUP BY overall_grade ORDER BY overall_grade`,
    [period]
  ) : [];

  const recentChanges = await queryAll(
    `SELECT e.*, a.name, a.display_name, a.avatar_url
     FROM agent_evaluations e JOIN agents a ON a.id = e.agent_id
     WHERE (e.promoted = true OR e.demoted = true OR e.department_after IS NOT NULL)
     ORDER BY e.created_at DESC LIMIT 20`
  );

  const divisionStats = await queryAll(
    `SELECT a.department,
       count(*) as agent_count,
       AVG(CASE e.overall_grade WHEN 'S' THEN 5 WHEN 'A' THEN 4 WHEN 'B' THEN 3 WHEN 'C' THEN 2 WHEN 'D' THEN 1 END) as avg_score,
       count(*) FILTER (WHERE e.overall_grade IN ('S','A')) as top_performers
     FROM agents a LEFT JOIN agent_evaluations e ON e.agent_id = a.id AND e.period = $1
     WHERE a.is_active = true AND a.department IS NOT NULL
     GROUP BY a.department ORDER BY avg_score DESC NULLS LAST`,
    [period]
  );

  const directiveStats = await queryOne(
    `SELECT
       count(*) as total,
       count(*) FILTER (WHERE status = 'approved') as approved,
       count(*) FILTER (WHERE status = 'rejected') as rejected,
       count(*) FILTER (WHERE status IN ('pending', 'in_progress')) as active
     FROM agent_directives`
  );

  success(res, {
    period,
    gradeDistribution,
    recentChanges,
    divisionStats,
    directiveStats,
  });
}));

/**
 * GET /hr/evaluations/:agentId
 */
router.get('/evaluations/:agentId', asyncHandler(async (req, res) => {
  const evaluations = await queryAll(
    `SELECT * FROM agent_evaluations WHERE agent_id = $1 ORDER BY period DESC LIMIT 30`,
    [req.params.agentId]
  );
  success(res, { evaluations });
}));

/**
 * GET /hr/directives/:agentId
 */
router.get('/directives/:agentId', asyncHandler(async (req, res) => {
  const issued = await queryAll(
    `SELECT d.*, a.name as to_name, a.display_name as to_display_name
     FROM agent_directives d JOIN agents a ON a.id = d.to_agent_id
     WHERE d.from_agent_id = $1 ORDER BY d.created_at DESC LIMIT 20`,
    [req.params.agentId]
  );
  const received = await queryAll(
    `SELECT d.*, a.name as from_name, a.display_name as from_display_name
     FROM agent_directives d JOIN agents a ON a.id = d.from_agent_id
     WHERE d.to_agent_id = $1 ORDER BY d.created_at DESC LIMIT 20`,
    [req.params.agentId]
  );
  success(res, { issued, received });
}));

/**
 * POST /hr/evaluate — Manual trigger (admin only)
 */
router.post('/evaluate', requireInternalSecret, asyncHandler(async (req, res) => {
  const dateStr = req.body.date || new Date().toISOString().split('T')[0];
  const result = await HRSystem.runDailyEvaluation(dateStr);
  success(res, result);
}));

/**
 * POST /hr/assign-all — Initial assignment (admin only, one-time)
 */
router.post('/assign-all', requireInternalSecret, asyncHandler(async (req, res) => {
  const result = await HRSystem.Assignment.assignAll();
  success(res, result);
}));

module.exports = router;
