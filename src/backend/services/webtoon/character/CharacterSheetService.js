/**
 * CharacterSheetService — CRUD for series character reference sheets
 *
 * Stores per-character name + description + reference image URL.
 * Used by WebtoonPipeline to inject character references into panel prompts.
 */

const { queryOne, queryAll } = require('../../../config/database');

class CharacterSheetService {
  /**
   * Get all characters for a series
   * @param {string} seriesId
   * @returns {Promise<Array<{ id, name, referenceImageUrl, description }>>}
   */
  static async getBySeriesId(seriesId) {
    const rows = await queryAll(
      `SELECT id, name, reference_image_url, description, created_at
       FROM series_characters
       WHERE series_id = $1
       ORDER BY created_at ASC`,
      [seriesId]
    );
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      referenceImageUrl: r.reference_image_url,
      description: r.description,
    }));
  }

  /**
   * Get reference image URLs only (for image-gen)
   * @param {string} seriesId
   * @returns {Promise<string[]>}
   */
  static async getReferenceUrls(seriesId) {
    const rows = await queryAll(
      `SELECT reference_image_url FROM series_characters
       WHERE series_id = $1 ORDER BY created_at ASC LIMIT 5`,
      [seriesId]
    );
    return rows.map(r => r.reference_image_url);
  }

  /**
   * Create a character entry
   * @param {string} seriesId
   * @param {{ name: string, referenceImageUrl: string, description?: string }} data
   */
  static async create(seriesId, { name, referenceImageUrl, description }) {
    return queryOne(
      `INSERT INTO series_characters (series_id, name, reference_image_url, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, reference_image_url, description`,
      [seriesId, name, referenceImageUrl, description || null]
    );
  }

  /**
   * Bulk create characters (for auto-extraction)
   * @param {string} seriesId
   * @param {Array<{ name: string, referenceImageUrl: string, description?: string }>} characters
   */
  static async bulkCreate(seriesId, characters) {
    const results = [];
    for (const char of characters) {
      const row = await this.create(seriesId, char);
      if (row) results.push(row);
    }
    return results;
  }

  /**
   * Delete a character
   * @param {string} characterId
   */
  static async delete(characterId) {
    return queryOne(
      `DELETE FROM series_characters WHERE id = $1 RETURNING id`,
      [characterId]
    );
  }

  /**
   * Create character with reference_urls JSONB
   */
  static async createWithRefs(seriesId, { name, description, personality, visualPrompt, referenceUrls }) {
    const legacyUrl = referenceUrls?.front || referenceUrls?.full || null;
    return queryOne(
      `INSERT INTO series_characters (series_id, name, reference_image_url, description, personality, visual_prompt, reference_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [seriesId, name, legacyUrl, description || null, personality || null, visualPrompt || null, JSON.stringify(referenceUrls || {})]
    );
  }

  /**
   * Check if series already has characters
   * @param {string} seriesId
   * @returns {Promise<boolean>}
   */
  static async hasCharacters(seriesId) {
    const row = await queryOne(
      `SELECT 1 FROM series_characters WHERE series_id = $1 LIMIT 1`,
      [seriesId]
    );
    return !!row;
  }
}

module.exports = CharacterSheetService;
