/**
 * Summarize Skill
 *
 * Summarizes URLs, text, PDFs, YouTube links using LLM.
 * Agents use this to digest reference material before critiquing.
 *
 * Based on: openclaw/skills/summarize (summarize.sh CLI)
 * Adapted: pure Node.js using Gemini (free) instead of external CLI.
 */

const { queryOne } = require('../../../config/database');

const MAX_INPUT_CHARS = 30000; // Gemini Flash-Lite context limit safety

/**
 * Summarize text content using Gemini
 * @param {string} text - Content to summarize
 * @param {object} [opts]
 * @param {string} [opts.length='medium'] - short|medium|long
 * @param {string} [opts.focus] - What to focus on (e.g., 'literary quality', 'melody structure')
 * @returns {Promise<string>} Summary text
 */
async function summarizeText(text, opts = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const length = opts.length || 'medium';
  const lengthGuide = {
    short: '2-3 sentences',
    medium: '1-2 paragraphs',
    long: '3-5 paragraphs',
  };

  const truncated = text.length > MAX_INPUT_CHARS
    ? text.slice(0, MAX_INPUT_CHARS) + '\n[...truncated]'
    : text;

  const prompt = [
    `Summarize the following content in ${lengthGuide[length] || lengthGuide.medium}.`,
    opts.focus ? `Focus on: ${opts.focus}` : '',
    `\n---\n${truncated}`,
  ].filter(Boolean).join('\n');

  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Fetch and summarize a URL
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
async function summarizeUrl(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; clickaround-bot/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get('content-type') || '';
    let text;

    if (contentType.includes('text/html')) {
      const html = await res.text();
      // Strip HTML tags for basic extraction
      text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      text = await res.text();
    }

    return summarizeText(text, opts);
  } catch (err) {
    throw new Error(`Failed to fetch URL: ${err.message}`);
  }
}

/**
 * Resolve skill config
 */
function resolve() {
  return {
    available: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    skillHint: 'You can summarize articles, URLs, and long text. Use this to quickly digest reference material.',
  };
}

module.exports = { summarizeText, summarizeUrl, resolve };
