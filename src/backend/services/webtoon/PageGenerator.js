/**
 * PageGenerator — Generate vertical webtoon strip images via Nano Banana 2
 *
 * Each page = one Nano Banana call → 3-4 panel vertical strip (9:16)
 * Character reference images injected for consistency
 */

const imageGen = require('../skills/image-gen');
const { uploadBuffer, buildAgentSeriesPath } = require('../../utils/storage');

class PageGenerator {
  static async generateAll({ pages, series, agent, episodeNumber, characters, style }) {
    const imageUrls = [];
    const failedPages = [];
    const charRefs = this._getCharacterRefs(characters);

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNum = String(i + 1).padStart(3, '0');

      try {
        const prompt = this._buildPagePrompt(page, series, style);
        const refs = [...charRefs];
        if (i > 0 && imageUrls[i - 1]) refs.push(imageUrls[i - 1]);

        const result = await imageGen.generate({
          prompt,
          aspectRatio: '9:16',
          referenceImageUrls: refs.length > 0 ? refs.slice(0, 3) : undefined,
        });

        const img = result.images?.[0];
        if (!img) {
          console.warn(`PageGenerator: page ${i + 1} returned no image`);
          failedPages.push(i);
          imageUrls.push(null);
          continue;
        }

        const storagePath = buildAgentSeriesPath(agent.name, {
          seriesSlug: series.slug,
          episodeNumber,
          filename: `page-${pageNum}.webp`,
        });

        const buffer = img.b64 ? Buffer.from(img.b64, 'base64') : null;

        if (!buffer) {
          if (img.url) { imageUrls.push(img.url); continue; }
          failedPages.push(i);
          imageUrls.push(null);
          continue;
        }

        const url = await uploadBuffer(buffer, '.webp', 'image/webp', null, { fullPath: storagePath });
        imageUrls.push(url);
        console.log(`PageGenerator: page ${i + 1}/${pages.length} uploaded → ${storagePath}`);
      } catch (err) {
        console.error(`PageGenerator: page ${i + 1} failed: ${err.message}`);
        failedPages.push(i);
        imageUrls.push(null);
      }
    }

    return { imageUrls, failedPages };
  }

  static _buildPagePrompt(page, series, style) {
    const genre = series.genre || 'fantasy';
    const styleName = style || series.style_preset || 'korean_webtoon';

    let prompt = `A 3-4 panel vertical webtoon strip, ${styleName} style, ${genre} genre, full color, high quality illustration. `;
    prompt += `Scene: ${page.scene}. `;
    if (page.dialogue) prompt += `Include speech bubbles with dialogue: ${page.dialogue}. `;
    if (page.mood) prompt += `Mood and atmosphere: ${page.mood}. `;
    prompt += 'Panels flow top to bottom in vertical scroll format. Consistent character design throughout all panels.';
    return prompt;
  }

  static _getCharacterRefs(characters) {
    if (!characters || characters.length === 0) return [];
    const refs = [];
    for (const char of characters.slice(0, 2)) {
      const urls = char.reference_urls || {};
      if (urls.front) refs.push(urls.front);
      if (urls.full && refs.length < 3) refs.push(urls.full);
      if (refs.length >= 3) break;
    }
    return refs;
  }
}

module.exports = PageGenerator;