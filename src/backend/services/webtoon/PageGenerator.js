/**
 * PageGenerator — Generate vertical webtoon strip images via Nano Banana 2
 *
 * Each page = one Nano Banana call → 3-4 panel vertical strip (9:16)
 * Character reference images injected for consistency
 */

const imageGen = require('../skills/image-gen');
const { uploadBuffer, buildAgentSeriesPath } = require('../../utils/storage');
const StylePresets = require('./style/StylePresets');

class PageGenerator {
  static async generateAll({ pages, series, agent, episodeNumber, characters, style, styleReferenceUrl }) {
    const imageUrls = [];
    const failedPages = [];
    const charRefs = this._getCharacterRefs(characters);

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNum = String(i + 1).padStart(3, '0');

      try {
        const prompt = this._buildPagePrompt(page, series, style);
        const refs = [];
        // Style reference first (strongest influence)
        if (styleReferenceUrl) refs.push(styleReferenceUrl);
        // Character references
        refs.push(...charRefs);
        // Previous page for continuity
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
    const preset = StylePresets.get(style || series.style_preset || 'korean_webtoon');
    const prefix = preset?.promptPrefix || '한국 네이버 웹툰 스타일. 사실적 인체 비율, 날카로운 턱선, 굵은 외곽선, 강한 명암 대비.';
    const suffix = preset?.promptSuffix || '프로 한국 웹툰 작화. 디지털 페인팅. 텍스트 없이 그림만.';

    let prompt = `${prefix} `;
    prompt += `${page.scene}. `;
    if (page.dialogue) {
      // Strip character name tags like (Jin), (Hero), [나레이션] etc
      let cleanDialogue = page.dialogue
        .replace(/^\s*\([^)]+\)\s*/g, '')       // (Jin) at start
        .replace(/^\s*\[[^\]]+\]\s*/g, '')       // [narration] at start
        .replace(/\s*\([^)]+\)\s*/g, ' ')        // (name) anywhere
        .trim();
      if (cleanDialogue) prompt += `말풍선 안에 한국어로: "${cleanDialogue}". `;
    }
    // MOOD는 프롬프트에 넣지 않음 — Nano Banana가 텍스트로 렌더링하는 버그
    prompt += suffix;
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