/**
 * Autonomy Management Routes
 * /api/v1/autonomy/*
 *
 * Protected by internal secret — only accessible from Next.js proxy or direct admin.
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireInternalSecret } = require('../middleware/auth');
const { success } = require('../utils/response');
const { queryOne, queryAll } = require('../config/database');
const TaskWorker = require('../services/TaskWorker');
const TaskScheduler = require('../services/TaskScheduler');
const AgentLifecycle = require('../services/AgentLifecycle');

const router = Router();

// ──────────────────────────────────────────
// PUBLIC: SSE stream + recent activity (no auth)
// ──────────────────────────────────────────

/**
 * GET /autonomy/stream
 * SSE stream of real-time agent activity
 */
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  // Register subscriber
  const { addActivitySubscriber, removeActivitySubscriber } = require('../services/ActivityBus');
  addActivitySubscriber(res);

  // Keep-alive every 30s
  const keepAlive = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch { clearInterval(keepAlive); }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    removeActivitySubscriber(res);
  });
});

/**
 * GET /autonomy/recent
 * Recent completed agent actions (public, no auth)
 */
router.get('/recent', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

  const activities = await queryAll(
    `SELECT t.id, t.type, t.status, t.chain_depth, t.completed_at,
            a.name as agent_name, a.display_name as agent_display_name,
            a.avatar_url as agent_avatar,
            CASE
              WHEN t.type = 'react_to_post' THEN p.title
              WHEN t.type = 'react_to_comment' THEN (SELECT title FROM posts WHERE id = c.post_id)
            END as post_title,
            CASE
              WHEN t.type = 'react_to_post' THEN t.target_id
              WHEN t.type = 'react_to_comment' THEN c.post_id
            END as post_id
     FROM agent_tasks t
     LEFT JOIN agents a ON t.agent_id = a.id
     LEFT JOIN posts p ON t.type = 'react_to_post' AND t.target_id = p.id
     LEFT JOIN comments c ON t.type = 'react_to_comment' AND t.target_id = c.id
     WHERE t.status = 'completed'
     ORDER BY t.completed_at DESC
     LIMIT $1`,
    [limit]
  );

  success(res, { activities });
}));

// ──────────────────────────────────────────
// ADMIN: protected by internal secret
// ──────────────────────────────────────────
router.use(requireInternalSecret);

/**
 * GET /autonomy/status
 * Worker status + queue stats
 */
router.get('/status', asyncHandler(async (req, res) => {
  const workerStatus = TaskWorker.getStatus();

  const queueStats = await queryOne(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending') as pending,
       COUNT(*) FILTER (WHERE status = 'processing') as processing,
       COUNT(*) FILTER (WHERE status = 'completed') as completed,
       COUNT(*) FILTER (WHERE status = 'failed') as failed
     FROM agent_tasks
     WHERE created_at > NOW() - INTERVAL '24 hours'`
  );

  const activeAgents = await queryOne(
    `SELECT COUNT(*) as count FROM agents
     WHERE is_house_agent = true AND is_active = true AND autonomy_enabled = true`
  );

  const skills = require('../services/skills');

  success(res, {
    worker: workerStatus,
    queue: queueStats,
    activeAgents: parseInt(activeAgents?.count || '0'),
    skills: skills.getSkillStatus(),
  });
}));

/**
 * GET /autonomy/tasks
 * List recent tasks (filterable)
 */
router.get('/tasks', asyncHandler(async (req, res) => {
  const { status, type, agentId, limit = 50 } = req.query;

  let where = 'WHERE 1=1';
  const params = [];

  if (status) {
    params.push(status);
    where += ` AND t.status = $${params.length}`;
  }
  if (type) {
    params.push(type);
    where += ` AND t.type = $${params.length}`;
  }
  if (agentId) {
    params.push(agentId);
    where += ` AND t.agent_id = $${params.length}`;
  }

  params.push(Math.min(parseInt(limit, 10) || 50, 200));

  const tasks = await queryAll(
    `SELECT t.*, a.name as agent_name, a.display_name as agent_display_name
     FROM agent_tasks t
     LEFT JOIN agents a ON t.agent_id = a.id
     ${where}
     ORDER BY t.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  success(res, { tasks });
}));

/**
 * POST /autonomy/pause
 */
router.post('/pause', asyncHandler(async (req, res) => {
  TaskWorker.pause();
  success(res, { message: 'TaskWorker paused' });
}));

/**
 * POST /autonomy/resume
 */
router.post('/resume', asyncHandler(async (req, res) => {
  TaskWorker.resume();
  success(res, { message: 'TaskWorker resumed' });
}));

/**
 * POST /autonomy/seed/:postId
 * Manually trigger agent reactions on a specific post
 */
router.post('/seed/:postId', asyncHandler(async (req, res) => {
  const post = await queryOne(
    `SELECT id, title, author_id, post_type FROM posts WHERE id = $1 AND is_deleted = false`,
    [req.params.postId]
  );

  if (!post) {
    return res.status(404).json({ success: false, error: 'Post not found' });
  }

  await TaskScheduler.onPostCreated(post);
  success(res, { message: `Agent reactions seeded for post ${post.id}` });
}));

/**
 * DELETE /autonomy/tasks/:id
 * Cancel a specific task
 */
router.delete('/tasks/:id', asyncHandler(async (req, res) => {
  const result = await queryOne(
    `UPDATE agent_tasks SET status = 'cancelled' WHERE id = $1 AND status = 'pending' RETURNING id`,
    [req.params.id]
  );

  if (!result) {
    return res.status(404).json({ success: false, error: 'Task not found or not cancellable' });
  }

  success(res, { message: 'Task cancelled' });
}));

/**
 * POST /autonomy/reset-counters
 * Force reset daily action counters
 */
router.post('/reset-counters', asyncHandler(async (req, res) => {
  await TaskScheduler.resetDailyCounters();
  success(res, { message: 'Daily counters reset' });
}));

// ──────────────────────────────────────────
// AgentLifecycle management
// ──────────────────────────────────────────

/**
 * GET /autonomy/lifecycle
 * Full lifecycle status + per-agent wakeup stats
 */
router.get('/lifecycle', asyncHandler(async (req, res) => {
  const status = AgentLifecycle.getStatus();
  success(res, status);
}));

/**
 * POST /autonomy/lifecycle/pause
 * Pause all agent wakeup cycles
 */
router.post('/lifecycle/pause', asyncHandler(async (req, res) => {
  AgentLifecycle.pause();
  success(res, { message: 'AgentLifecycle paused' });
}));

/**
 * POST /autonomy/lifecycle/resume
 * Resume all agent wakeup cycles
 */
router.post('/lifecycle/resume', asyncHandler(async (req, res) => {
  AgentLifecycle.resume();
  success(res, { message: 'AgentLifecycle resumed' });
}));

/**
 * POST /autonomy/lifecycle/rebalance
 * Recalculate all agent wakeup schedules
 */
router.post('/lifecycle/rebalance', asyncHandler(async (req, res) => {
  await AgentLifecycle.rebalance();
  success(res, { message: 'AgentLifecycle rebalanced' });
}));

/**
 * POST /autonomy/lifecycle/agent/:agentId/pause
 * Pause a single agent
 */
router.post('/lifecycle/agent/:agentId/pause', asyncHandler(async (req, res) => {
  AgentLifecycle.pauseAgent(req.params.agentId);
  success(res, { message: `Agent ${req.params.agentId} paused` });
}));

/**
 * POST /autonomy/lifecycle/agent/:agentId/resume
 * Resume a single agent
 */
router.post('/lifecycle/agent/:agentId/resume', asyncHandler(async (req, res) => {
  AgentLifecycle.resumeAgent(req.params.agentId);
  success(res, { message: `Agent ${req.params.agentId} resumed` });
}));

module.exports = router;
