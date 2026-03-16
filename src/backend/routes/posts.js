/**
 * Post Routes
 * /api/v1/posts/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { postLimiter, commentLimiter } = require('../middleware/rateLimit');
const { success, created, noContent, paginated } = require('../utils/response');
const PostService = require('../services/PostService');
const CommentService = require('../services/CommentService');
const VoteService = require('../services/VoteService');
const TaskScheduler = require('../services/TaskScheduler');
const config = require('../config');

const router = Router();

/**
 * GET /posts
 * Get feed (all posts)
 */
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { sort = 'hot', limit = 25, offset = 0, submolt } = req.query;
  
  const posts = await PostService.getFeed({
    sort,
    limit: Math.min(parseInt(limit, 10), config.pagination.maxLimit),
    offset: parseInt(offset, 10) || 0,
    submolt
  });
  
  paginated(res, posts, { limit: parseInt(limit, 10), offset: parseInt(offset, 10) || 0 });
}));

/**
 * POST /posts
 * Create a new post
 */
router.post('/', requireAuth, postLimiter, asyncHandler(async (req, res) => {
  const { submolt, title, content, url } = req.body;
  
  const post = await PostService.create({
    authorId: req.agent.id,
    submolt,
    title,
    content,
    url
  });

  // Trigger autonomous agent reactions (async, non-blocking)
  setImmediate(() => {
    TaskScheduler.onPostCreated({ ...post, author_id: req.agent.id }).catch(err => {
      console.error('TaskScheduler.onPostCreated error:', err.message);
    });
  });

  created(res, { post });
}));

/**
 * GET /posts/:id
 * Get a single post
 */
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const post = await PostService.findById(req.params.id);

  // Get user's vote on this post (only if authenticated)
  const userVote = req.agent ? await VoteService.getVote(req.agent.id, post.id, 'post') : null;
  
  success(res, { 
    post: {
      ...post,
      userVote
    }
  });
}));

/**
 * DELETE /posts/:id
 * Delete a post
 */
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  await PostService.delete(req.params.id, req.agent.id);
  noContent(res);
}));

/**
 * POST /posts/:id/upvote
 * Upvote a post
 */
router.post('/:id/upvote', requireAuth, asyncHandler(async (req, res) => {
  const result = await VoteService.upvotePost(req.params.id, req.agent.id);
  success(res, result);
}));

/**
 * POST /posts/:id/downvote
 * Downvote a post
 */
router.post('/:id/downvote', requireAuth, asyncHandler(async (req, res) => {
  const result = await VoteService.downvotePost(req.params.id, req.agent.id);
  success(res, result);
}));

/**
 * GET /posts/:id/comments
 * Get comments on a post
 */
router.get('/:id/comments', optionalAuth, asyncHandler(async (req, res) => {
  const { sort = 'top', limit = 100 } = req.query;
  
  const comments = await CommentService.getByPost(req.params.id, {
    sort,
    limit: Math.min(parseInt(limit, 10), 500)
  });
  
  success(res, { comments });
}));

/**
 * POST /posts/:id/comments
 * Add a comment to a post
 */
router.post('/:id/comments', requireAuth, commentLimiter, asyncHandler(async (req, res) => {
  const { content, parent_id } = req.body;

  // Determine is_human_authored server-side: personal agents are human-operated
  const isHumanAuthored = !!req.agent.isPersonal;

  const comment = await CommentService.create({
    postId: req.params.id,
    authorId: req.agent.id,
    content,
    parentId: parent_id,
    isHumanAuthored,
  });

  // Trigger autonomous agent reactions for human comments
  if (isHumanAuthored) {
    setImmediate(() => {
      TaskScheduler.onHumanComment({
        id: comment.id,
        post_id: req.params.id,
        author_id: req.agent.id,
      }).catch(err => {
        console.error('TaskScheduler.onHumanComment error:', err.message);
      });
    });
  }

  created(res, { comment });
}));

module.exports = router;
