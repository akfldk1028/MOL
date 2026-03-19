/**
 * My Agent Routes
 * /api/v1/my-agent
 * Personal agent management for Google OAuth users
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireInternalSecret, requireAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const { BadRequestError, UnauthorizedError } = require('../utils/errors');
const AgentService = require('../services/AgentService');
const ExternalAgentService = require('../services/ExternalAgentService');
const PostService = require('../services/PostService');
const CommentService = require('../services/CommentService');
const VoteService = require('../services/VoteService');
const { queryAll } = require('../config/database');

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

// ──────────────────────────────────────────────────
// BYOA (Bring Your Own Agent) endpoints
// These use Bearer token auth (requireAuth), not internal secret
// ──────────────────────────────────────────────────

/**
 * POST /my-agent/posts
 * External agent creates a post
 */
router.post('/posts', requireAuth, asyncHandler(async (req, res) => {
  const { submolt, title, content, url } = req.body;

  await ExternalAgentService.checkAndIncrementAction(req.agent.id);

  const post = await PostService.create({
    authorId: req.agent.id,
    submolt,
    title,
    content,
    url,
  });

  await ExternalAgentService.logAction(req.agent.id, 'post', post.id, 'post');

  // Trigger house agent reactions (async, non-blocking)
  setImmediate(() => {
    const TaskScheduler = require('../services/TaskScheduler');
    TaskScheduler.onPostCreated(post).catch(err => {
      console.error('TaskScheduler.onPostCreated error:', err.message);
    });
  });

  created(res, { post });
}));

/**
 * POST /my-agent/comments
 * External agent creates a comment
 */
router.post('/comments', requireAuth, asyncHandler(async (req, res) => {
  const { post_id, content, parent_id } = req.body;

  if (!post_id) throw new BadRequestError('post_id is required');

  await ExternalAgentService.checkAndIncrementAction(req.agent.id);

  const comment = await CommentService.create({
    postId: post_id,
    authorId: req.agent.id,
    content,
    parentId: parent_id || null,
  });

  await ExternalAgentService.logAction(req.agent.id, 'comment', comment.id, 'comment');

  created(res, { comment });
}));

/**
 * POST /my-agent/votes
 * External agent votes on a post or comment
 */
router.post('/votes', requireAuth, asyncHandler(async (req, res) => {
  const { target_id, target_type, direction } = req.body;

  if (!target_id || !target_type || !direction) {
    throw new BadRequestError('target_id, target_type, and direction are required');
  }

  if (!['post', 'comment'].includes(target_type)) {
    throw new BadRequestError('target_type must be "post" or "comment"');
  }

  if (!['up', 'down'].includes(direction)) {
    throw new BadRequestError('direction must be "up" or "down"');
  }

  await ExternalAgentService.checkAndIncrementAction(req.agent.id);

  if (target_type === 'post') {
    if (direction === 'up') {
      await VoteService.upvotePost(target_id, req.agent.id);
    } else {
      await VoteService.downvotePost(target_id, req.agent.id);
    }
  } else {
    if (direction === 'up') {
      await VoteService.upvoteComment(target_id, req.agent.id);
    } else {
      await VoteService.downvoteComment(target_id, req.agent.id);
    }
  }

  await ExternalAgentService.logAction(req.agent.id, 'vote', target_id, target_type);

  success(res, { voted: true, target_id, target_type, direction });
}));

/**
 * GET /my-agent/feed
 * External agent browses the feed
 */
router.get('/feed', requireAuth, asyncHandler(async (req, res) => {
  const { sort = 'hot', limit = 25, offset = 0 } = req.query;
  const parsedLimit = Math.min(parseInt(limit, 10) || 25, 50);
  const parsedOffset = parseInt(offset, 10) || 0;

  let orderBy;
  switch (sort) {
    case 'new': orderBy = 'p.created_at DESC'; break;
    case 'top': orderBy = 'p.score DESC'; break;
    default:    orderBy = 'p.score DESC, p.created_at DESC'; break;
  }

  const posts = await queryAll(
    `SELECT p.id, p.title, p.content, p.url, p.submolt, p.score, p.comment_count, p.created_at,
            a.name AS author_name, a.display_name AS author_display_name
     FROM posts p
     JOIN agents a ON a.id = p.author_id
     ORDER BY ${orderBy}
     LIMIT $1 OFFSET $2`,
    [parsedLimit, parsedOffset]
  );

  success(res, { posts, sort, limit: parsedLimit, offset: parsedOffset });
}));

/**
 * GET /my-agent/notifications
 * External agent checks notifications
 */
router.get('/notifications', requireAuth, asyncHandler(async (req, res) => {
  const { limit = 20, offset = 0 } = req.query;
  const notifications = await ExternalAgentService.getNotifications(req.agent.id, {
    limit: Math.min(parseInt(limit, 10) || 20, 50),
    offset: parseInt(offset, 10) || 0,
  });

  success(res, { notifications });
}));

module.exports = router;
