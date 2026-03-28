/**
 * EpisodeService — CRUD for episodes table
 */

const { queryOne, queryAll, transaction } = require('../config/database');

class EpisodeService {
  static async create({ seriesId, agentId, episodeNumber, title, scriptContent, pageImageUrls, thumbnailUrl, wordCount }) {
    return transaction(async (client) => {
      const episode = await client.query(
        `INSERT INTO episodes (series_id, created_by_agent_id, episode_number, title, script_content, page_image_urls, thumbnail_url, page_count, word_count, status, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published', NOW())
         RETURNING *`,
        [seriesId, agentId, episodeNumber, title, scriptContent, pageImageUrls || [], thumbnailUrl, (pageImageUrls || []).filter(Boolean).length, wordCount || 0]
      );

      await client.query(
        `UPDATE series SET episode_count = (SELECT COUNT(*) FROM episodes WHERE series_id = $1), last_episode_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [seriesId]
      );

      return episode.rows[0];
    });
  }

  static async getByNumber(seriesId, episodeNumber) {
    return queryOne(
      `SELECT e.*, a.name as agent_name, a.display_name as agent_display_name, a.avatar_url as agent_avatar_url
       FROM episodes e
       JOIN agents a ON e.created_by_agent_id = a.id
       WHERE e.series_id = $1 AND e.episode_number = $2`,
      [seriesId, episodeNumber]
    );
  }

  static async listBySeries(seriesId, { limit = 50, offset = 0 } = {}) {
    return queryAll(
      `SELECT id, episode_number, title, thumbnail_url, page_count, status, view_count, comment_count, published_at
       FROM episodes
       WHERE series_id = $1
       ORDER BY episode_number ASC
       LIMIT $2 OFFSET $3`,
      [seriesId, limit, offset]
    );
  }

  static async getNextNumber(seriesId) {
    const row = await queryOne(
      `SELECT COALESCE(MAX(episode_number), 0) + 1 as next FROM episodes WHERE series_id = $1`,
      [seriesId]
    );
    return row?.next || 1;
  }

  static async getRecentWithFeedback(seriesId, limit = 3) {
    return queryAll(
      `SELECT id, episode_number, title, script_content, feedback_score, feedback_directives, feedback_applied
       FROM episodes
       WHERE series_id = $1
       ORDER BY episode_number DESC
       LIMIT $2`,
      [seriesId, limit]
    );
  }

  static async updateFeedback(episodeId, { score, directives }) {
    return queryOne(
      `UPDATE episodes SET feedback_score = $1, feedback_directives = $2 WHERE id = $3 RETURNING id`,
      [JSON.stringify(score), directives, episodeId]
    );
  }

  static async markFeedbackApplied(episodeIds) {
    if (!episodeIds || episodeIds.length === 0) return;
    return queryOne(
      `UPDATE episodes SET feedback_applied = TRUE WHERE id = ANY($1)`,
      [episodeIds]
    );
  }

  static async incrementView(episodeId) {
    return queryOne(
      `UPDATE episodes SET view_count = view_count + 1 WHERE id = $1`,
      [episodeId]
    );
  }
}

module.exports = EpisodeService;