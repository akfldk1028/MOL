/**
 * Series Routes
 * /api/v1/series/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireInternalSecret } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const { queryOne, queryAll } = require('../config/database');
const config = require('../config');

const router = Router();

/**
 * POST /series
 * Create a new series
 */
router.post('/', requireInternalSecret, asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'User authentication required' });
  }

  const { title, slug, description, contentType, genre, tags, domainSlug, coverImageUrl, scheduleDays, stylePreset } = req.body;

  if (!title || !slug) {
    return res.status(400).json({ success: false, error: 'title and slug are required' });
  }

  const series = await queryOne(
    `INSERT INTO series (title, slug, description, content_type, genre, tags, domain_slug, cover_image_url, schedule_days, created_by_user_id, style_preset)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [title, slug, description, contentType || 'novel', genre, tags || [], domainSlug, coverImageUrl, scheduleDays || [], userId, stylePreset || null]
  );

  created(res, { series });
}));

/**
 * GET /series
 * List series with optional filters
 */
router.get('/', asyncHandler(async (req, res) => {
  const { type, status, day, limit = 25, offset = 0, sort = 'new' } = req.query;
  const lim = Math.min(parseInt(limit, 10), config.pagination.maxLimit);
  const off = parseInt(offset, 10) || 0;

  const conditions = [];
  const params = [];
  let idx = 1;

  if (type) {
    conditions.push(`s.content_type = $${idx++}`);
    params.push(type);
  }
  if (day === 'completed') {
    // 완결 탭: status 필터를 completed로 강제 (status 파라미터 무시)
    conditions.push(`s.status = 'completed'`);
  } else {
    if (status) {
      conditions.push(`s.status = $${idx++}`);
      params.push(status);
    }
    if (day) {
      conditions.push(`$${idx++} = ANY(s.schedule_days)`);
      params.push(day);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = sort === 'popular' ? 's.subscriber_count DESC' : 's.created_at DESC';

  const series = await queryAll(
    `SELECT s.*,
            u.name AS author_name,
            a.display_name AS agent_name
     FROM series s
     LEFT JOIN users u ON s.created_by_user_id = u.id
     LEFT JOIN agents a ON s.created_by_agent_id = a.id
     ${where}
     ORDER BY ${orderBy}
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, lim, off]
  );

  success(res, { series, has_more: series.length >= lim });
}));

/**
 * GET /series/style-presets
 * List available webtoon art style presets
 * MUST be before /:slug to avoid slug match
 */
router.get('/style-presets', asyncHandler(async (_req, res) => {
  const { StylePresets } = require('../services/webtoon');
  success(res, { presets: StylePresets.list() });
}));

/**
 * GET /series/:slug
 * Get series detail with episodes
 */
router.get('/:slug', asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const series = await queryOne(
    `SELECT s.*,
            u.name AS author_name,
            a.display_name AS agent_name
     FROM series s
     LEFT JOIN users u ON s.created_by_user_id = u.id
     LEFT JOIN agents a ON s.created_by_agent_id = a.id
     WHERE s.slug = $1`,
    [slug]
  );

  if (!series) {
    return res.status(404).json({ success: false, error: 'Series not found' });
  }

  // Add autonomous flag
  series.is_autonomous = !!series.created_by_agent_id;

  // Get episodes (title lives on posts table, joined via post_id)
  const episodes = await queryAll(
    `SELECT c.id, p.title, c.creation_type, c.genre, c.status,
            c.episode_number, c.position, c.volume_label, c.published_at,
            c.image_urls,
            p.comment_count, p.upvotes AS like_count, c.created_at
     FROM creations c
     LEFT JOIN posts p ON c.post_id = p.id
     WHERE c.series_id = $1
     ORDER BY c.position ASC NULLS LAST, c.episode_number ASC`,
    [series.id]
  );

  success(res, { series, episodes });
}));

/**
 * POST /series/autonomous
 * Create an agent-authored autonomous series
 */
router.post('/autonomous', requireInternalSecret, asyncHandler(async (req, res) => {
  const { agentId, title, slug, description, synopsis, contentType, genre, tags, domainSlug, coverImageUrl, scheduleDays, episodePromptHint, targetWordCount, stylePreset } = req.body;

  if (!agentId || !title || !slug) {
    return res.status(400).json({ success: false, error: 'agentId, title, and slug are required' });
  }

  // Verify agent exists
  const agent = await queryOne('SELECT id FROM agents WHERE id = $1 AND is_active = true', [agentId]);
  if (!agent) {
    return res.status(404).json({ success: false, error: 'Agent not found' });
  }

  // Check slug uniqueness
  const existing = await queryOne('SELECT id FROM series WHERE slug = $1', [slug]);
  if (existing) {
    return res.status(409).json({ success: false, error: 'Slug already in use' });
  }

  const SeriesContentScheduler = require('../services/SeriesContentScheduler');
  const nextEpisodeAt = SeriesContentScheduler._calculateNextEpisodeAt(scheduleDays || [], new Date());

  const series = await queryOne(
    `INSERT INTO series (title, slug, description, content_type, genre, tags, domain_slug, cover_image_url,
                         schedule_days, created_by_agent_id, synopsis, episode_prompt_hint, target_word_count,
                         next_episode_at, style_preset)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [title, slug, description, contentType || 'novel', genre, tags || [], domainSlug,
     coverImageUrl, scheduleDays || [], agentId, synopsis, episodePromptHint,
     targetWordCount || 2000, nextEpisodeAt?.toISOString() || null, stylePreset || null]
  );

  created(res, { series });
}));

/**
 * POST /series/:slug/trigger-episode
 * Manually trigger an episode creation for an autonomous series
 */
router.post('/:slug/trigger-episode', requireInternalSecret, asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const series = await queryOne(
    `SELECT * FROM series WHERE slug = $1 AND created_by_agent_id IS NOT NULL`,
    [slug]
  );
  if (!series) {
    return res.status(404).json({ success: false, error: 'Autonomous series not found' });
  }

  // Check for existing pending task
  const pendingTask = await queryOne(
    `SELECT id FROM agent_tasks
     WHERE target_id = $1 AND type = 'create_episode' AND status IN ('pending', 'processing')
     LIMIT 1`,
    [series.id]
  );
  if (pendingTask) {
    return res.status(409).json({ success: false, error: 'Episode creation already in progress' });
  }

  const TaskScheduler = require('../services/TaskScheduler');
  const task = await TaskScheduler.createTask({
    type: 'create_episode',
    agentId: series.created_by_agent_id,
    targetId: series.id,
    targetType: 'series',
    delayMinutes: 0,
    chainDepth: 0,
  });

  success(res, { task_id: task.id, message: 'Episode creation triggered' });
}));

/**
 * PATCH /series/:slug/schedule
 * Update schedule and settings for an autonomous series
 */
router.patch('/:slug/schedule', requireInternalSecret, asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { scheduleDays, episodePromptHint, targetWordCount } = req.body;

  const series = await queryOne('SELECT id FROM series WHERE slug = $1', [slug]);
  if (!series) {
    return res.status(404).json({ success: false, error: 'Series not found' });
  }

  const updates = [];
  const params = [];
  let idx = 1;

  if (scheduleDays !== undefined) {
    updates.push(`schedule_days = $${idx++}`);
    params.push(scheduleDays);

    // Recalculate next_episode_at
    const SeriesContentScheduler = require('../services/SeriesContentScheduler');
    const nextAt = SeriesContentScheduler._calculateNextEpisodeAt(scheduleDays, new Date());
    updates.push(`next_episode_at = $${idx++}`);
    params.push(nextAt?.toISOString() || null);
  }
  if (episodePromptHint !== undefined) {
    updates.push(`episode_prompt_hint = $${idx++}`);
    params.push(episodePromptHint);
  }
  if (targetWordCount !== undefined) {
    updates.push(`target_word_count = $${idx++}`);
    params.push(targetWordCount);
  }

  if (updates.length === 0) {
    return res.status(400).json({ success: false, error: 'No fields to update' });
  }

  updates.push('updated_at = NOW()');
  params.push(series.id);

  const updated = await queryOne(
    `UPDATE series SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );

  success(res, { series: updated });
}));

/**
 * POST /series/:slug/episodes
 * Add an episode (creation) to a series
 */
router.post('/:slug/episodes', requireInternalSecret, asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'User authentication required' });
  }

  const { slug } = req.params;
  const { title, content, genre, imageUrls, volumeLabel } = req.body;

  // Look up series first (no increment yet)
  const seriesCheck = await queryOne(`SELECT id, episode_count FROM series WHERE slug = $1`, [slug]);
  if (!seriesCheck) {
    return res.status(404).json({ success: false, error: 'Series not found' });
  }

  const CreationService = require('../services/CreationService');
  let createResult;
  try {
    createResult = await CreationService.create({
      userId,
      title: title || `${(seriesCheck.episode_count || 0) + 1}화`,
      content,
      creationType: 'novel',
      genre,
      tags: [],
      domainSlug: null,
      imageUrls: imageUrls || [],
    });
  } catch (err) {
    throw err; // Don't increment episode_count if creation fails
  }

  // Only increment after successful creation
  const series = await queryOne(
    `UPDATE series SET episode_count = episode_count + 1, updated_at = NOW()
     WHERE slug = $1
     RETURNING episode_count`,
    [slug]
  );
  const nextEp = series.episode_count;

  // Link to series
  await queryOne(
    `UPDATE creations SET series_id = $1, episode_number = $2, position = $2, volume_label = $3
     WHERE id = $4`,
    [seriesCheck.id, nextEp, volumeLabel || null, createResult.creation.id]
  );

  created(res, { episode: { ...createResult.creation, episode_number: nextEp } });
}));

/**
 * POST /series/:slug/subscribe
 * Subscribe to a series
 */
router.post('/:slug/subscribe', requireInternalSecret, asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'User authentication required' });
  }

  const series = await queryOne('SELECT id FROM series WHERE slug = $1', [req.params.slug]);
  if (!series) {
    return res.status(404).json({ success: false, error: 'Series not found' });
  }

  const inserted = await queryOne(
    `INSERT INTO series_subscriptions (series_id, user_id) VALUES ($1, $2)
     ON CONFLICT (series_id, user_id) DO NOTHING RETURNING id`,
    [series.id, userId]
  );

  if (inserted) {
    await queryOne(
      'UPDATE series SET subscriber_count = subscriber_count + 1 WHERE id = $1',
      [series.id]
    );
  }

  success(res, { subscribed: true });
}));

/**
 * DELETE /series/:slug/subscribe
 * Unsubscribe from a series
 */
router.delete('/:slug/subscribe', requireInternalSecret, asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'User authentication required' });
  }

  const series = await queryOne('SELECT id FROM series WHERE slug = $1', [req.params.slug]);
  if (!series) {
    return res.status(404).json({ success: false, error: 'Series not found' });
  }

  const deleted = await queryOne(
    'DELETE FROM series_subscriptions WHERE series_id = $1 AND user_id = $2 RETURNING id',
    [series.id, userId]
  );

  if (deleted) {
    await queryOne(
      'UPDATE series SET subscriber_count = GREATEST(subscriber_count - 1, 0) WHERE id = $1',
      [series.id]
    );
  }

  success(res, { subscribed: false });
}));

/**
 * GET /series/:slug/characters
 * List characters for a series
 */
router.get('/:slug/characters', asyncHandler(async (req, res) => {
  const series = await queryOne('SELECT id FROM series WHERE slug = $1', [req.params.slug]);
  if (!series) {
    return res.status(404).json({ success: false, error: 'Series not found' });
  }

  const { CharacterSheetService } = require('../services/webtoon');
  const characters = await CharacterSheetService.getBySeriesId(series.id);
  success(res, { characters });
}));

module.exports = router;
