/**
 * EpisodeGenerator — Orchestrates full episode creation
 *
 * Flow: LLM script → ScriptParser → PageGenerator → EpisodeService
 */

const ScriptParser = require('./ScriptParser');
const PageGenerator = require('./PageGenerator');
const EpisodeService = require('../EpisodeService');
const CharacterSheetService = require('./character/CharacterSheetService');

class EpisodeGenerator {
  static async generate({ llmResponse, series, agent, episodeNumber }) {
    // 1. Parse script
    const { title, pages } = ScriptParser.parse(llmResponse);
    const episodeTitle = title || `Episode ${episodeNumber}`;

    if (pages.length === 0) {
      console.warn('EpisodeGenerator: no [PAGE] blocks found, treating as novel');
      const episode = await EpisodeService.create({
        seriesId: series.id,
        agentId: agent.id,
        title: episodeTitle,
        scriptContent: llmResponse,
        pageImageUrls: [],
        wordCount: llmResponse.split(/\s+/).length,
      });
      return { episode, imageUrls: [] };
    }

    // 2. Load character sheets + style reference
    const characters = await this._loadCharacters(series.id);
    const styleReferenceUrl = this._buildStyleReferenceUrl(series, agent);

    // 3. Generate page images
    console.log(`EpisodeGenerator: generating ${pages.length} pages for "${episodeTitle}"`);
    const { imageUrls, failedPages } = await PageGenerator.generateAll({
      pages,
      series,
      agent,
      episodeNumber,
      characters,
      style: series.style_preset,
      styleReferenceUrl,
    });

    const validUrls = imageUrls.filter(Boolean);
    if (validUrls.length === 0 && pages.length > 0) {
      throw new Error(`All ${pages.length} page image generations failed for "${episodeTitle}"`);
    }

    if (failedPages.length > 0) {
      console.warn(`EpisodeGenerator: ${failedPages.length} pages failed: [${failedPages.join(',')}]`);
    }

    // 4. Thumbnail = first page image
    const thumbnailUrl = validUrls[0] || null;

    // 5. Save to DB
    const episode = await EpisodeService.create({
      seriesId: series.id,
      agentId: agent.id,
      title: episodeTitle,
      scriptContent: llmResponse,
      pageImageUrls: validUrls,
      thumbnailUrl,
      wordCount: llmResponse.split(/\s+/).length,
    });

    console.log(`EpisodeGenerator: "${episodeTitle}" saved with ${validUrls.length} pages`);
    return { episode, imageUrls: validUrls };
  }

  /**
   * Build style reference URL (if exists in Storage)
   */
  static _buildStyleReferenceUrl(series, agent) {
    const { buildAgentSeriesPath } = require('../../utils/storage');
    const storagePath = buildAgentSeriesPath(agent.name, {
      seriesSlug: series.slug,
      filename: 'style-reference.webp',
    });
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!baseUrl) return null;
    return `${baseUrl}/storage/v1/object/public/creations/${storagePath}`;
  }

  static async _loadCharacters(seriesId) {
    const { queryAll } = require('../../config/database');
    const rows = await queryAll(
      `SELECT id, name, reference_image_url, description, reference_urls
       FROM series_characters WHERE series_id = $1 ORDER BY created_at ASC`,
      [seriesId]
    );
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      referenceImageUrl: r.reference_image_url,
      description: r.description,
      reference_urls: r.reference_urls || {},
    }));
  }
}

module.exports = EpisodeGenerator;