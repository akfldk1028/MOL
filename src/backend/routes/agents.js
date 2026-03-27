/**
 * Agent Routes
 * /api/v1/agents/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const AgentService = require('../services/AgentService');
const ExternalAgentService = require('../services/ExternalAgentService');
const { NotFoundError } = require('../utils/errors');
const path = require('path');
const fs = require('fs');

const router = Router();

// Cache SKILL.md at startup
const skillPath = path.join(__dirname, '..', 'skill', 'SKILL.md');
const skillContent = fs.readFileSync(skillPath, 'utf-8');

/**
 * GET /agents/skill
 * Return SKILL.md for external agents (no auth required)
 */
router.get('/skill', (req, res) => {
  res.type('text/markdown').send(skillContent);
});

/**
 * POST /agents/register
 * Register a new agent (supports BYOA fields)
 */
router.post('/register', asyncHandler(async (req, res) => {
  const { name, description, persona, domain, archetype, llm_provider, llm_model } = req.body;
  const result = await AgentService.register({ name, description, persona, domain, archetype, llm_provider, llm_model });
  created(res, result);
}));

/**
 * GET /agents/heartbeat
 * External agent heartbeat — trending posts, mentions, suggestions
 */
router.get('/heartbeat', requireAuth, asyncHandler(async (req, res) => {
  const data = await ExternalAgentService.getHeartbeat(req.agent.id);
  success(res, data);
}));

/**
 * GET /agents/me
 * Get current agent profile
 */
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  success(res, { agent: req.agent });
}));

/**
 * PATCH /agents/me
 * Update current agent profile
 */
router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const { description, displayName } = req.body;
  const agent = await AgentService.update(req.agent.id, { 
    description, 
    display_name: displayName 
  });
  success(res, { agent });
}));

/**
 * GET /agents/status
 * Get agent claim status
 */
router.get('/status', requireAuth, asyncHandler(async (req, res) => {
  const status = await AgentService.getStatus(req.agent.id);
  success(res, status);
}));

/**
 * GET /agents/profile
 * Get another agent's profile (public endpoint)
 */
router.get('/profile', optionalAuth, asyncHandler(async (req, res) => {
  const { name } = req.query;

  if (!name) {
    throw new NotFoundError('Member');
  }

  const agent = await AgentService.findByName(name);

  if (!agent) {
    throw new NotFoundError('Member');
  }

  // Check if current user is following (only if authenticated)
  const isFollowing = req.agent
    ? await AgentService.isFollowing(req.agent.id, agent.id)
    : false;

  // Get recent posts
  const recentPosts = await AgentService.getRecentPosts(agent.id);

  success(res, {
    agent: {
      name: agent.name,
      displayName: agent.display_name,
      description: agent.description,
      karma: agent.karma,
      followerCount: agent.follower_count,
      followingCount: agent.following_count,
      isClaimed: agent.is_claimed,
      createdAt: agent.created_at,
      lastActive: agent.last_active
    },
    isFollowing,
    recentPosts
  });
}));

/**
 * POST /agents/:name/follow
 * Follow an agent
 */
router.post('/:name/follow', requireAuth, asyncHandler(async (req, res) => {
  const agent = await AgentService.findByName(req.params.name);
  
  if (!agent) {
    throw new NotFoundError('Agent');
  }
  
  const result = await AgentService.follow(req.agent.id, agent.id);
  success(res, result);
}));

/**
 * DELETE /agents/:name/follow
 * Unfollow an agent
 */
router.delete('/:name/follow', requireAuth, asyncHandler(async (req, res) => {
  const agent = await AgentService.findByName(req.params.name);

  if (!agent) {
    throw new NotFoundError('Agent');
  }

  const result = await AgentService.unfollow(req.agent.id, agent.id);
  success(res, result);
}));

/**
 * GET /agents/leaderboard
 * Get top agents by karma
 */
router.get('/leaderboard', asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const agents = await AgentService.getLeaderboard(Math.min(parseInt(limit, 10), 50));
  success(res, { agents });
}));

/**
 * GET /agents/recent
 * Get recently registered agents
 */
router.get('/recent', asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const agents = await AgentService.getRecentAgents(Math.min(parseInt(limit, 10), 50));
  success(res, { agents });
}));

/**
 * GET /agents/directory
 * Get all active house agents with archetype, topics, and saju info
 */
router.get('/directory', asyncHandler(async (req, res) => {
  const { queryAll } = require('../config/database'); // same pattern as other routes
  const agents = await queryAll(
    `SELECT a.id, a.name, a.display_name, a.description, a.avatar_url,
            a.archetype, a.expertise_topics, a.karma, a.follower_count,
            a.personality, a.persona,
            s.gyeokguk, s.yongsin, s.day_gan, s.day_ji, s.oheng_distribution
     FROM agents a
     LEFT JOIN agent_saju_origin s ON s.agent_id = a.id
     WHERE a.is_house_agent = true AND a.is_active = true
     ORDER BY a.karma DESC, a.name`
  );

  success(res, {
    agents: agents.map(a => ({
      name: a.name,
      displayName: a.display_name,
      description: a.description,
      avatarUrl: a.avatar_url,
      archetype: a.archetype,
      topics: a.expertise_topics || [],
      karma: a.karma,
      followers: a.follower_count,
      personality: a.personality,
      saju: a.gyeokguk ? {
        gyeokguk: a.gyeokguk,
        yongsin: a.yongsin,
        dayGan: a.day_gan,
        dayJi: a.day_ji,
        oheng: a.oheng_distribution,
      } : null,
    })),
    total: agents.length,
  });
}));

module.exports = router;
