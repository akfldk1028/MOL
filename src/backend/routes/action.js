/**
 * action.js
 * ---------
 * REST endpoints for action-domains (negotiation, data-analysis).
 *
 * Routes:
 *   POST /api/v1/action/negotiate      — start a negotiation session
 *   GET  /api/v1/action/negotiate/:id  — get session status
 *   POST /api/v1/action/analyze        — start an analysis pipeline
 *   GET  /api/v1/action/analyze/:id    — get analysis result
 *   GET  /api/v1/action/domains        — list available action domains
 *
 * Auth: requires Bearer (user) OR internal secret (agent-to-agent).
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, requireInternalSecret } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const { BadRequestError } = require('../utils/errors');
const { queryOne } = require('../config/database');

const router = Router();

// In-memory session cache (short-lived; cleared on restart)
// For persistent session tracking, extend later to use agent_tasks or a new table.
const _sessionCache = new Map();
const SESSION_TTL = 3600_000; // 1h

function cacheSession(id, data) {
  _sessionCache.set(id, { data, ts: Date.now() });
  // Simple TTL sweep
  if (_sessionCache.size > 200) {
    const now = Date.now();
    for (const [key, entry] of _sessionCache.entries()) {
      if (now - entry.ts > SESSION_TTL) _sessionCache.delete(key);
    }
  }
}

function getCachedSession(id) {
  const entry = _sessionCache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.ts > SESSION_TTL) {
    _sessionCache.delete(id);
    return null;
  }
  return entry.data;
}

// ─────────────────────────────────────────────
// Auth: allow Bearer OR internal secret
// ─────────────────────────────────────────────

function authEither(req, res, next) {
  const secret = req.headers['x-internal-secret'];
  if (secret && secret === process.env.INTERNAL_API_SECRET) {
    req._authVia = 'internal';
    return next();
  }
  // Fall through to requireAuth (Bearer)
  return requireAuth(req, res, next);
}

// ─────────────────────────────────────────────
// GET /action/domains
// ─────────────────────────────────────────────

router.get(
  '/domains',
  asyncHandler(async (req, res) => {
    const loader = require('../action-domains/_base/action-loader');
    const domains = loader.loadAll();
    const list = [];
    for (const [slug, domain] of domains.entries()) {
      list.push({
        slug,
        name: domain.config.name,
        description: domain.config.description,
        type: domain.config.type,
        tier: domain.config.tier || 'free',
        agent_count: domain.agents.length,
        role_count: domain.roles.length,
        tools: domain.config.tools || [],
      });
    }
    success(res, { domains: list });
  })
);

// ─────────────────────────────────────────────
// POST /action/negotiate — start negotiation
// ─────────────────────────────────────────────

router.post(
  '/negotiate',
  authEither,
  asyncHandler(async (req, res) => {
    const { topic, parties, deadline_turns = 15, initial_offer = null } = req.body || {};

    if (!topic || typeof topic !== 'string') {
      throw new BadRequestError('topic (string) required');
    }
    if (!Array.isArray(parties) || parties.length < 2) {
      throw new BadRequestError('parties must be an array of at least 2 participants');
    }

    // Load NegotiationHarness
    const { NegotiationHarness } = require('../action-domains/negotiation/harness/NegotiationHarness');
    const { UtilityFunction } = require('../action-domains/negotiation/components/UtilityFunction');
    const { BATNA } = require('../action-domains/negotiation/components/BATNA');
    const { Proposal } = require('../action-domains/negotiation/components/Proposal');

    // Resolve each party: fetch agent from DB, build utility/BATNA
    const resolvedParties = [];
    for (const p of parties) {
      if (!p.agent_id) throw new BadRequestError('each party must have agent_id');
      const agent = await queryOne(
        `SELECT id, name, display_name, persona, archetype, activity_config
         FROM agents WHERE id = $1`,
        [p.agent_id]
      );
      if (!agent) throw new BadRequestError(`agent not found: ${p.agent_id}`);

      const utility = p.utility
        ? new UtilityFunction({ agent_id: agent.id, ...p.utility })
        : null;
      const batna = p.batna
        ? new BATNA({ agent_id: agent.id, ...p.batna })
        : null;

      resolvedParties.push({
        agent_id: agent.id,
        agent_name: agent.name,
        role: p.role || 'Negotiator',
        persona: agent.persona,
        archetype: agent.archetype,
        utility,
        batna,
      });
    }

    // Create session + run
    const harness = new NegotiationHarness();
    const session = harness.createSession({
      topic,
      parties: resolvedParties,
      deadlineTurns: Math.max(2, Math.min(50, parseInt(deadline_turns, 10) || 15)),
    });

    // Optional initial offer
    let initialProposal = null;
    if (initial_offer && initial_offer.terms) {
      initialProposal = new Proposal({
        from: initial_offer.from || resolvedParties[0].agent_id,
        to: initial_offer.to || resolvedParties[1].agent_id,
        session_id: session.id,
        round: 1,
        terms: initial_offer.terms,
        rationale: initial_offer.rationale || '',
        message_type: 'offer',
      });
    }

    // Run the session (this may take tens of seconds with real LLM)
    const result = await harness.run(session, { initialOffer: initialProposal });

    cacheSession(session.id, { domain: 'negotiation', result });

    created(res, {
      session_id: session.id,
      state: result.state,
      deal: result.deal,
      reason: result.reason,
      total_rounds: result.total_rounds,
      trajectory_length: result.trajectory.length,
    });
  })
);

// ─────────────────────────────────────────────
// GET /action/negotiate/:id
// ─────────────────────────────────────────────

router.get(
  '/negotiate/:id',
  authEither,
  asyncHandler(async (req, res) => {
    const cached = getCachedSession(req.params.id);
    if (!cached) {
      return res.status(404).json({ success: false, error: 'Session not found or expired' });
    }
    success(res, cached.result);
  })
);

// ─────────────────────────────────────────────
// POST /action/analyze — start analysis pipeline
// ─────────────────────────────────────────────

router.post(
  '/analyze',
  authEither,
  asyncHandler(async (req, res) => {
    const { goal, data_source, user_id = null } = req.body || {};

    if (!goal || typeof goal !== 'string') {
      throw new BadRequestError('goal (string, NL intent) required');
    }
    if (!data_source || !data_source.source_type) {
      throw new BadRequestError('data_source.source_type required');
    }

    const { AnalysisHarness } = require('../action-domains/data-analysis/harness/AnalysisHarness');
    const { Goal } = require('../action-domains/data-analysis/components/Goal');
    const { DataSource } = require('../action-domains/data-analysis/components/DataSource');

    const goalObj = new Goal({ nl_intent: goal, user_id });
    const dsObj = new DataSource({
      source_type: data_source.source_type,
      uri: data_source.uri,
      schema: data_source.schema || null,
    });

    const harness = new AnalysisHarness();
    const session = harness.createSession({ goal: goalObj, dataSource: dsObj });

    const result = await harness.run(session);

    cacheSession(session.id, { domain: 'data-analysis', result });

    created(res, {
      session_id: session.id,
      reason: result.reason,
      insight: result.insight,
      visualization: result.visualization,
      plan_summary: result.plan
        ? { subproblem_count: result.plan.subproblems?.length || 0 }
        : null,
    });
  })
);

// ─────────────────────────────────────────────
// GET /action/analyze/:id
// ─────────────────────────────────────────────

router.get(
  '/analyze/:id',
  authEither,
  asyncHandler(async (req, res) => {
    const cached = getCachedSession(req.params.id);
    if (!cached) {
      return res.status(404).json({ success: false, error: 'Analysis not found or expired' });
    }
    success(res, cached.result);
  })
);

// ─────────────────────────────────────────────
// GET /action/agents — list action-tagged agents
// ─────────────────────────────────────────────

router.get(
  '/agents',
  asyncHandler(async (req, res) => {
    const { domain } = req.query;
    const { queryAll } = require('../config/database');
    let sql = `SELECT id, name, display_name, archetype,
               activity_config->>'action_domain' AS action_domain,
               activity_config->>'action_role' AS action_role
               FROM agents
               WHERE activity_config->>'action_domain' IS NOT NULL`;
    const params = [];
    if (domain) {
      sql += ` AND activity_config->>'action_domain' = $1`;
      params.push(domain);
    }
    sql += ` ORDER BY activity_config->>'action_domain', name`;
    const rows = await queryAll(sql, params);
    success(res, { agents: rows, count: rows.length });
  })
);

module.exports = router;
