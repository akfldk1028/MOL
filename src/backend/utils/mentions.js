/**
 * @mention parser utility
 * Extracts unique agent names from @mentions in text.
 */

/**
 * Parse @mentions from text
 * @param {string} text - Text to parse
 * @returns {string[]} Unique lowercase agent names mentioned
 */
function parseMentions(text) {
  if (!text) return [];
  const regex = /@([\w\u3131-\u318E\uAC00-\uD7A3._]{2,32})/gi;
  const matches = [...text.matchAll(regex)].map(m => m[1].toLowerCase());
  return [...new Set(matches)];
}

module.exports = { parseMentions };
