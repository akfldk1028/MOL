/**
 * length-governance.js
 * --------------------
 * Genre-specific chapter length specs (soft/hard range).
 * Inspired by InkOS LengthSpec design — independently implemented.
 *
 * Korean counting: charCount / 2.5 ≈ word count (Korean syllable density).
 */

/**
 * @typedef {Object} LengthSpec
 * @property {number} target
 * @property {number} softMin
 * @property {number} softMax
 * @property {number} hardMin
 * @property {number} hardMax
 */

const GENRE_LENGTH_SPECS = {
  fantasy:      { target: 3500, softMin: 2500, softMax: 5000, hardMin: 1500, hardMax: 7000 },
  martial_arts: { target: 3500, softMin: 2500, softMax: 5000, hardMin: 1500, hardMax: 7000 },
  romance:      { target: 2500, softMin: 1800, softMax: 3500, hardMin: 1200, hardMax: 5000 },
  thriller:     { target: 3000, softMin: 2000, softMax: 4000, hardMin: 1500, hardMax: 6000 },
  sci_fi:       { target: 3000, softMin: 2000, softMax: 4500, hardMin: 1500, hardMax: 6000 },
  general:      { target: 2500, softMin: 1500, softMax: 4000, hardMin: 1000, hardMax: 6000 },
};

/**
 * Get LengthSpec for a genre.
 * @param {string} genre
 * @returns {LengthSpec}
 */
function getLengthSpec(genre) {
  return GENRE_LENGTH_SPECS[genre] || GENRE_LENGTH_SPECS.general;
}

/**
 * Korean-aware word count.
 * Korean: charCount / 2.5 (each 한글 char ≈ 1 syllable, avg word = 2-3 syllables)
 * @param {string} text
 * @returns {number}
 */
function countKoreanWords(text) {
  if (!text) return 0;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const charCount = text.replace(/\s/g, '').length;
  const isKorean = /[\uAC00-\uD7AF]/.test(text);
  return isKorean ? Math.max(wordCount, Math.floor(charCount / 2.5)) : wordCount;
}

/**
 * Check if word count is outside soft range.
 * @returns {'expand'|'compress'|'none'}
 */
function getNormalizeMode(wordCount, spec) {
  if (wordCount < spec.softMin) return 'expand';
  if (wordCount > spec.softMax) return 'compress';
  return 'none';
}

/**
 * Check if word count is outside hard range (error).
 */
function isOutsideHardRange(wordCount, spec) {
  return wordCount < spec.hardMin || wordCount > spec.hardMax;
}

module.exports = {
  GENRE_LENGTH_SPECS,
  getLengthSpec,
  countKoreanWords,
  getNormalizeMode,
  isOutsideHardRange,
};
