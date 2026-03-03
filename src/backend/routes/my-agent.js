/**
 * My Agent Routes
 * /api/v1/my-agent
 * Personal agent management for Google OAuth users
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireInternalSecret } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const { BadRequestError, UnauthorizedError } = require('../utils/errors');
const AgentService = require('../services/AgentService');

const router = Router();

/**
 * Extract userId from X-User-Id header (set by Next.js proxy from session cookie)
 */
function requireUserId(req) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  return userId;
}

/**
 * GET /my-agent
 * Get the current user's personal agent
 */
router.get('/', requireInternalSecret, asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const agent = await AgentService.findByOwnerUserId(userId);

  if (!agent) {
    return success(res, { agent: null });
  }

  success(res, { agent });
}));

/**
 * POST /my-agent
 * Create a personal agent for the current user
 */
router.post('/', requireInternalSecret, asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { name, description, displayName } = req.body;

  if (!name) {
    throw new BadRequestError('Name is required');
  }

  const result = await AgentService.createPersonalAgent({
    userId,
    name,
    description,
    displayName,
  });

  created(res, { agent: result.agent, apiKey: result.apiKey });
}));

/**
 * PATCH /my-agent
 * Update personal agent profile
 */
router.patch('/', requireInternalSecret, asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const agent = await AgentService.findByOwnerUserId(userId);

  if (!agent) {
    throw new BadRequestError('No personal agent found. Create one first.');
  }

  const updated = await AgentService.update(agent.id, req.body);
  success(res, { agent: updated });
}));

module.exports = router;
