/**
 * WebtoonPipeline — Main orchestrator for webtoon episode generation
 *
 * Flow:
 *   Script → PanelScriptParser → PanelLayoutEngine → PanelPromptBuilder
 *     → image-gen/generate() → QualityEvaluator → RetryStrategy → save
 *
 * Features:
 * - Character sheet integration (auto-inject reference images)
 * - Panel-sequential generation (prev panel feeds into next)
 * - Quality evaluation with retry
 * - Style preset application
 */

const PanelScriptParser = require('./panel/PanelScriptParser');
const PanelLayoutEngine = require('./panel/PanelLayoutEngine');
const PanelPromptBuilder = require('./panel/PanelPromptBuilder');
const CharacterSheetService = require('./character/CharacterSheetService');
const CharacterExtractor = require('./character/CharacterExtractor');
const QualityEvaluator = require('./quality/QualityEvaluator');
const RetryStrategy = require('./quality/RetryStrategy');

class WebtoonPipeline {
  /**
   * Generate webtoon panels from LLM episode content
   *
   * @param {object} opts
   * @param {string} opts.content - Raw LLM output with [PANEL] blocks
   * @param {object} opts.series - Series DB row
   * @param {number} opts.episodeNumber - Episode number
   * @param {boolean} [opts.enableQualityCheck=false] - Enable quality evaluation (costs extra LLM calls)
   * @returns {Promise<{ panels: Array, imageUrls: string[], content: string }>}
   */
  static async generate({ content, series, episodeNumber, enableQualityCheck = false }) {
    // 1. Parse panels from LLM output
    const parsedPanels = PanelScriptParser.parse(content);
    if (parsedPanels.length === 0) {
      console.log('WebtoonPipeline: no [PANEL] blocks found, returning raw content');
      return { panels: [], imageUrls: [], content };
    }

    // 2. Assign layout/emphasis
    const layoutPanels = PanelLayoutEngine.assignLayout(parsedPanels);

    // 3. Load character sheets for this series
    const characters = await CharacterSheetService.getBySeriesId(series.id);

    // Also get legacy character_reference_urls as fallback
    const legacyRefs = series.character_reference_urls || [];

    // 4. Build prompts for each panel
    const panelPrompts = PanelPromptBuilder.buildAll(layoutPanels, characters, {
      genre: series.genre,
      stylePreset: series.style_preset,
    });

    // 5. Generate images panel-by-panel
    const imageGen = require('../skills/image-gen');
    const { uploadBuffer } = require('../../utils/storage');
    const imageUrls = [];

    for (let i = 0; i < panelPrompts.length; i++) {
      const pp = panelPrompts[i];

      // Merge character sheet refs with legacy refs (dedup)
      const allRefUrls = [...new Set([...pp.referenceImageUrls, ...legacyRefs])].slice(0, 3);

      // Add previous panel image as continuity reference (SEED-Story inspired)
      const prevImageUrl = i > 0 ? imageUrls[i - 1] : null;
      if (prevImageUrl) {
        allRefUrls.push(prevImageUrl);
      }

      const url = await this._generatePanelImage(imageGen, uploadBuffer, {
        prompt: pp.prompt,
        aspectRatio: pp.aspectRatio,
        referenceImageUrls: allRefUrls.length > 0 ? allRefUrls.slice(0, 4) : undefined,
        panelIndex: i,
        totalPanels: panelPrompts.length,
        enableQualityCheck,
      });

      imageUrls.push(url);
    }

    // 6. Auto-extract characters from first episode
    const isFirstEpisode = episodeNumber <= 1;
    if (isFirstEpisode && characters.length === 0) {
      const rawPanels = parsedPanels.map(p => ({
        image: p.sceneDescription,
        text: p.dialogue,
      }));
      await CharacterExtractor.extractAndSave(series.id, rawPanels, imageUrls).catch(err => {
        console.warn('WebtoonPipeline: character extraction failed:', err.message);
      });

      // Also save legacy refs for backward compatibility
      if (legacyRefs.length === 0) {
        const newRefs = imageUrls.filter(Boolean).slice(0, 2);
        if (newRefs.length > 0) {
          const { queryOne } = require('../../config/database');
          await queryOne(
            `UPDATE series SET character_reference_urls = $1 WHERE id = $2 AND (character_reference_urls IS NULL OR character_reference_urls = '{}')`,
            [newRefs, series.id]
          ).catch(() => {});
        }
      }
    }

    // 7. Build final content with embedded images
    const finalContent = this._buildContent(panelPrompts, imageUrls);

    const validCount = imageUrls.filter(Boolean).length;
    console.log(`WebtoonPipeline: generated ${validCount}/${panelPrompts.length} panel images for ep${episodeNumber}`);

    return {
      panels: panelPrompts.map((pp, i) => ({
        ...pp,
        imageUrl: imageUrls[i],
      })),
      imageUrls,
      content: finalContent,
    };
  }

  /**
   * Generate a single panel image with retry logic
   */
  static async _generatePanelImage(imageGen, uploadBuffer, opts) {
    const { prompt, aspectRatio, referenceImageUrls, panelIndex, totalPanels, enableQualityCheck } = opts;
    const maxAttempts = 2;

    let currentPrompt = prompt;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`  Panel ${panelIndex + 1}/${totalPanels}: retry ${attempt}...`);
        }

        const result = await Promise.race([
          imageGen.generate({
            prompt: currentPrompt,
            aspectRatio: aspectRatio || '9:16',
            referenceImageUrls,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Image gen timeout')), 30_000)),
        ]);

        const img = result.images?.[0];
        let url = null;

        if (img?.b64) {
          const ext = (img.mimeType || '').includes('jpeg') ? '.jpg' : '.png';
          const buffer = Buffer.from(img.b64, 'base64');
          url = await uploadBuffer(buffer, ext, img.mimeType || 'image/png');
        } else if (img?.url) {
          url = img.url;
        }

        if (!url) continue;

        console.log(`  Panel ${panelIndex + 1}/${totalPanels}: generated (${result.provider})`);

        // Quality check (optional, costs extra API call)
        if (enableQualityCheck && attempt < maxAttempts - 1) {
          const evalResult = await QualityEvaluator.evaluate(url, prompt);
          const retry = RetryStrategy.decide(evalResult, currentPrompt, attempt, maxAttempts);
          if (retry.shouldRetry) {
            console.log(`  Panel ${panelIndex + 1}: quality check failed (${retry.reason}), retrying...`);
            currentPrompt = retry.modifiedPrompt;
            continue;
          }
        }

        return url;
      } catch (err) {
        console.warn(`  Panel ${panelIndex + 1}/${totalPanels}: failed (attempt ${attempt + 1}) — ${err.message}`);
      }
    }

    return null; // all attempts failed
  }

  /**
   * Build webtoon content with image URLs and [PANEL] structure preserved
   * Keeps [PANEL] blocks so WebtoonViewer can extract dialogue for speech bubbles.
   */
  static _buildContent(panelPrompts, imageUrls) {
    const parts = [];
    for (let i = 0; i < panelPrompts.length; i++) {
      const url = imageUrls[i];
      const dialogue = panelPrompts[i].dialogue;

      // Preserve [PANEL] structure for WebtoonViewer's extractDialogueMap
      parts.push('[PANEL]');
      parts.push(`IMAGE: ${panelPrompts[i].prompt.slice(0, 200)}`);
      if (dialogue) {
        parts.push(`TEXT: ${dialogue}`);
      }
      parts.push('[/PANEL]');

      // Embed image as markdown (WebtoonViewer reads this for rendering)
      if (url) {
        parts.push(`![Panel ${i + 1}](${url})`);
        // Dialogue is in [PANEL] TEXT: block → WebtoonViewer shows as speech bubble overlay
        // Do NOT add standalone dialogue text here to avoid duplication
      } else if (dialogue) {
        // No image → show dialogue as standalone text
        parts.push(dialogue);
      }
      parts.push(''); // blank line between panels
    }
    return parts.join('\n');
  }
}

module.exports = WebtoonPipeline;
