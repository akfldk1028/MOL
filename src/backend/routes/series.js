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

  const { title, slug, description, contentType, genre, tags, domainSlug, coverImageUrl, scheduleDays } = req.body;

  if (!title || !slug) {
    return res.status(400).json({ success: false, error: 'title and slug are required' });
  }

  const series = await queryOne(
    `INSERT INTO series (title, slug, description, content_type, genre, tags, domain_slug, cover_image_url, schedule_days, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [title, slug, description, contentType || 'novel', genre, tags || [], domainSlug, coverImageUrl, scheduleDays || [], userId]
  );

  created(res, { series });
}));

/**
 * GET /series
 * List series with optional filters
 */
router.get('/', asyncHandler(async (req, res) => {
  const { type, status, limit = 25, offset = 0, sort = 'new' } = req.query;
  const lim = Math.min(parseInt(limit, 10), config.pagination.maxLimit);
  const off = parseInt(offset, 10) || 0;

  const conditions = [];
  const params = [];
  let idx = 1;

  if (type) {
    conditions.push(`s.content_type = $${idx++}`);
    params.push(type);
  }
  if (status) {
    conditions.push(`s.status = $${idx++}`);
    params.push(status);
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

  // Get episodes (title lives on posts table, joined via post_id)
  const episodes = await queryAll(
    `SELECT c.id, p.title, c.creation_type, c.genre, c.status,
            c.episode_number, c.position, c.volume_label, c.published_at,
            p.comment_count, c.created_at
     FROM creations c
     LEFT JOIN posts p ON c.post_id = p.id
     WHERE c.series_id = $1
     ORDER BY c.position ASC NULLS LAST, c.episode_number ASC`,
    [series.id]
  );

  success(res, { series, episodes });
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

  const series = await queryOne('SELECT id, episode_count FROM series WHERE slug = $1', [slug]);
  if (!series) {
    return res.status(404).json({ success: false, error: 'Series not found' });
  }

  const { title, content, genre, imageUrls, volumeLabel } = req.body;
  const nextEp = series.episode_count + 1;

  const CreationService = require('../services/CreationService');
  const result = await CreationService.create({
    userId,
    title: title || `${nextEp}화`,
    content,
    creationType: 'novel', // will be overridden below if needed
    genre,
    tags: [],
    domainSlug: null,
    imageUrls: imageUrls || [],
  });

  // Link to series
  await queryOne(
    `UPDATE creations SET series_id = $1, episode_number = $2, position = $2, volume_label = $3
     WHERE id = $4`,
    [series.id, nextEp, volumeLabel || null, result.creation.id]
  );

  // Update series counter
  await queryOne(
    `UPDATE series SET episode_count = episode_count + 1, updated_at = NOW() WHERE id = $1`,
    [series.id]
  );

  created(res, { episode: { ...result.creation, episode_number: nextEp } });
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

  await queryOne(
    `INSERT INTO series_subscriptions (series_id, user_id) VALUES ($1, $2)
     ON CONFLICT (series_id, user_id) DO NOTHING`,
    [series.id, userId]
  );

  await queryOne(
    'UPDATE series SET subscriber_count = subscriber_count + 1 WHERE id = $1',
    [series.id]
  );

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

module.exports = router;
