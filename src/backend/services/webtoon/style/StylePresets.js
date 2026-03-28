/**
 * StylePresets — Art style presets for webtoon generation
 *
 * Each preset defines:
 * - promptPrefix: prepended to every panel prompt
 * - promptSuffix: appended to every panel prompt
 * - negativePrompt: what to avoid (for future use with negative prompting)
 *
 * Inspired by B-LoRA's content/style separation concept.
 */

const PRESETS = {
  manga: {
    name: 'Japanese Manga',
    promptPrefix: 'Black and white manga style, screentone shading, dynamic linework, Japanese comic art,',
    promptSuffix: 'manga panel, high contrast, clean lineart, professional manga illustration.',
    negativePrompt: 'color, photograph, 3d render, blurry',
  },
  korean_webtoon: {
    name: 'Korean Webtoon',
    promptPrefix: 'Korean manhwa webtoon style, soft cel-shading, clean digital lineart with varying line weight, vibrant flat colors, expressive eyes and faces, modern Korean webtoon aesthetic, vertical panel format,',
    promptSuffix: 'manhwa webtoon panel, professional Korean webcomic illustration, vibrant color palette, smooth digital coloring.',
    negativePrompt: 'western comic style, realistic, 3D render, photograph, anime screencap, rough sketch, black and white',
  },
  watercolor: {
    name: 'Watercolor',
    promptPrefix: 'Watercolor painting style, soft washes, gentle colors, artistic illustration,',
    promptSuffix: 'watercolor art, delicate brushstrokes, soft edges, artistic panel.',
    negativePrompt: 'digital art, sharp edges, vector, photograph',
  },
  retro: {
    name: 'Retro',
    promptPrefix: 'Retro vintage comic style, halftone dots, bold outlines, 1960s pop art,',
    promptSuffix: 'vintage comic panel, retro color palette, nostalgic illustration.',
    negativePrompt: 'modern, photorealistic, 3d, smooth shading',
  },
  horror: {
    name: 'Horror',
    promptPrefix: 'Dark horror comic style, heavy shadows, grotesque details, unsettling atmosphere,',
    promptSuffix: 'horror manga panel, dark palette, dramatic lighting, eerie illustration.',
    negativePrompt: 'bright, cheerful, cartoon, cute',
  },
  fantasy: {
    name: 'Fantasy',
    promptPrefix: 'Fantasy art style, epic illustration, magical atmosphere, detailed world-building,',
    promptSuffix: 'fantasy comic panel, rich colors, dramatic composition, high quality illustration.',
    negativePrompt: 'modern, mundane, photograph, minimalist',
  },
  chibi: {
    name: 'Chibi / Cute',
    promptPrefix: 'Chibi style, cute deformed characters, big heads, small bodies, kawaii,',
    promptSuffix: 'chibi illustration, adorable, pastel colors, cute comic panel.',
    negativePrompt: 'realistic proportions, dark, horror, gritty',
  },
  realistic: {
    name: 'Realistic',
    promptPrefix: 'Semi-realistic digital painting, detailed anatomy, cinematic lighting,',
    promptSuffix: 'digital painting, photorealistic rendering, cinematic composition, high detail.',
    negativePrompt: 'cartoon, anime, chibi, flat colors',
  },
};

// Default fallback when no preset is set
const DEFAULT_PREFIX = 'Webtoon style, vertical scroll comic panel, full color, high quality illustration.';
const DEFAULT_SUFFIX = '';

class StylePresets {
  /**
   * Get all available presets
   * @returns {Array<{ key: string, name: string }>}
   */
  static list() {
    return Object.entries(PRESETS).map(([key, val]) => ({
      key,
      name: val.name,
    }));
  }

  /**
   * Get a specific preset
   * @param {string} presetKey
   * @returns {object|null}
   */
  static get(presetKey) {
    return PRESETS[presetKey] || null;
  }

  /**
   * Get prompt prefix for a preset (falls back to genre-based default)
   * @param {string|null} presetKey
   * @param {string|null} genre
   * @returns {string}
   */
  static getPrefix(presetKey, genre) {
    if (presetKey && PRESETS[presetKey]) {
      return PRESETS[presetKey].promptPrefix;
    }
    // Genre-based fallback
    if (genre) {
      return `Webtoon style, vertical scroll comic panel, ${genre}, full color, high quality illustration.`;
    }
    return DEFAULT_PREFIX;
  }

  /**
   * Get prompt suffix for a preset
   * @param {string|null} presetKey
   * @returns {string}
   */
  static getSuffix(presetKey) {
    if (presetKey && PRESETS[presetKey]) {
      return PRESETS[presetKey].promptSuffix;
    }
    return DEFAULT_SUFFIX;
  }

  /**
   * Check if a preset key is valid
   * @param {string} key
   * @returns {boolean}
   */
  static isValid(key) {
    return key in PRESETS;
  }
}

module.exports = StylePresets;
