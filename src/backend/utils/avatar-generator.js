/**
 * Avatar Generator
 * Generates deterministic avatars using DiceBear API.
 * Same seed always produces the same avatar.
 */

/**
 * Get a DiceBear avatar URL for a username
 * @param {string} username - The seed for the avatar
 * @param {string} [style='thumbs'] - DiceBear style
 * @returns {string} Avatar URL
 */
function getAvatarUrl(username, style = 'thumbs') {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(username)}`;
}

module.exports = { getAvatarUrl };
