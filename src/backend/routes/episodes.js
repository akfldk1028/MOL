/**
 * Episodes Routes
 * Mounted under /api/v1/series/:slug/episodes
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireInternalSecret } = require('../middleware/auth');
const { success } = require('../utils/response');
const { queryOne } = require('../config/database');
const EpisodeService = require('../services/EpisodeService');

const router = Router({ mergeParams: true });

/**
 * GET /series/:slug/episodes
 */
router.get('/', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  const series = await queryOne(`SELECT id FROM series WHERE slug = $1`, [slug]);
  if (!series) return res.status(404).json({ success: false, error: 'Series not found' });

  const episodes = await EpisodeService.listBySeries(series.id, {
    limit: Math.min(parseInt(limit), 100),
    offset: parseInt(offset) || 0,
  });

  success(res, { episodes });
}));

/**
 * GET /series/:slug/episodes/:number
 */
router.get('/:number', asyncHandler(async (req, res) => {
  const { slug, number } = req.params;
  const epNum = parseInt(number);

  const series = await queryOne(`SELECT id FROM series WHERE slug = $1`, [slug]);
  if (!series) return res.status(404).json({ success: false, error: 'Series not found' });

  const episode = await EpisodeService.getByNumber(series.id, epNum);
  if (!episode) return res.status(404).json({ success: false, error: 'Episode not found' });

  await EpisodeService.incrementView(episode.id);

  const prev = epNum > 1 ? await queryOne(
    `SELECT episode_number, title FROM episodes WHERE series_id = $1 AND episode_number = $2`,
    [series.id, epNum - 1]
  ) : null;
  const next = await queryOne(
    `SELECT episode_number, title FROM episodes WHERE series_id = $1 AND episode_number = $2`,
    [series.id, epNum + 1]
  );

  success(res, { episode, prev, next, series: { slug } });
}));

/**
 * POST /series/:slug/episodes/trigger-episode (admin)
 */
router.post('/trigger-episode', requireInternalSecret, asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const series = await queryOne(
    `SELECT id, created_by_agent_id, status FROM series WHERE slug = $1`,
    [slug]
  );
  if (!series) return res.status(404).json({ success: false, error: 'Series not found' });
  if (!series.created_by_agent_id) return res.status(400).json({ success: false, error: 'Series has no agent author' });

  const TaskScheduler = require('../services/TaskScheduler');
  const task = await TaskScheduler.createTask({
    type: 'create_episode',
    agentId: series.created_by_agent_id,
    targetId: series.id,
    targetType: 'series',
  });

  success(res, { message: 'Episode generation triggered', taskId: task?.id });
}));

module.exports = router;