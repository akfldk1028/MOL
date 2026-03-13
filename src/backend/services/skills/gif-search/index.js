/**
 * GIF Search Skill
 *
 * Search for GIFs via Tenor API. Agents can use reaction GIFs
 * in comments and discussions.
 *
 * Based on: openclaw/skills/gifgrep
 * Adapted: direct Tenor API call (no CLI needed), free tier.
 */

const TENOR_API = 'https://tenor.googleapis.com/v2';

/**
 * Search for GIFs
 * @param {string} query - Search query
 * @param {object} [opts]
 * @param {number} [opts.limit=5] - Max results
 * @param {string} [opts.locale='en_US'] - Locale
 * @returns {Promise<Array<{ id: string, title: string, url: string, previewUrl: string, width: number, height: number }>>}
 */
async function search(query, opts = {}) {
  const apiKey = process.env.TENOR_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('TENOR_API_KEY or GOOGLE_API_KEY not set');

  const limit = opts.limit || 5;
  const locale = opts.locale || 'en_US';

  const params = new URLSearchParams({
    q: query,
    key: apiKey,
    limit: String(limit),
    locale,
    media_filter: 'gif,tinygif',
  });

  const res = await fetch(`${TENOR_API}/search?${params}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tenor API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return (data.results || []).map(r => ({
    id: r.id,
    title: r.title || r.content_description || '',
    url: r.media_formats?.gif?.url || r.url || '',
    previewUrl: r.media_formats?.tinygif?.url || '',
    width: r.media_formats?.gif?.dims?.[0] || 0,
    height: r.media_formats?.gif?.dims?.[1] || 0,
  }));
}

/**
 * Get trending GIFs
 * @param {object} [opts]
 * @param {number} [opts.limit=5]
 * @returns {Promise<Array>}
 */
async function trending(opts = {}) {
  const apiKey = process.env.TENOR_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('TENOR_API_KEY or GOOGLE_API_KEY not set');

  const limit = opts.limit || 5;
  const params = new URLSearchParams({
    key: apiKey,
    limit: String(limit),
    media_filter: 'gif,tinygif',
  });

  const res = await fetch(`${TENOR_API}/featured?${params}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Tenor API error: ${res.status}`);

  const data = await res.json();
  return (data.results || []).map(r => ({
    id: r.id,
    title: r.title || r.content_description || '',
    url: r.media_formats?.gif?.url || '',
    previewUrl: r.media_formats?.tinygif?.url || '',
  }));
}

function resolve() {
  return {
    available: !!(process.env.TENOR_API_KEY || process.env.GOOGLE_API_KEY),
    skillHint: 'You can search for and share reaction GIFs in discussions.',
  };
}

module.exports = { search, trending, resolve };
