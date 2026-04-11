/**
 * web-fetcher.js
 * --------------
 * Generic web fetcher for the `scout` agent.
 *
 * Restrictions:
 *   - Allowed schemes: http, https only
 *   - Allowed domains (optional whitelist via env)
 *   - Max response size: 1MB
 *   - Timeout: 15s
 *   - User-Agent: Clickaround-Analyst-Bot/1.0
 */

const MAX_BYTES = 1_000_000;
const DEFAULT_TIMEOUT = 15_000;
const USER_AGENT = 'Clickaround-Analyst-Bot/1.0 (+https://www.goodmolt.app/bot)';

/**
 * Parse the optional domain whitelist from env.
 * Set `ANALYST_WEB_WHITELIST=example.com,example.org` to restrict.
 */
function getWhitelist() {
  const raw = process.env.ANALYST_WEB_WHITELIST || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Is this URL allowed to fetch?
 */
function isAllowed(url) {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const whitelist = getWhitelist();
    if (whitelist.length === 0) return true; // no restriction
    return whitelist.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Strip HTML tags to get plain text (naive but effective for prompts).
 */
function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch a URL and return its body (raw or text-extracted).
 * @param {string} url
 * @param {object} [options]
 * @param {string} [options.format='text']  - 'text' | 'json' | 'raw'
 * @param {number} [options.timeout]
 * @returns {Promise<{ ok, content, errors, status, contentType }>}
 */
async function fetchUrl(url, options = {}) {
  const { format = 'text', timeout = DEFAULT_TIMEOUT } = options;

  if (!isAllowed(url)) {
    return { ok: false, content: null, errors: [`URL not allowed: ${url}`], status: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      return {
        ok: false,
        content: null,
        errors: [`HTTP ${res.status}`],
        status: res.status,
        contentType: res.headers.get('content-type'),
      };
    }
    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    let bytes = 0;
    const chunks = [];
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > MAX_BYTES) {
          reader.cancel();
          return {
            ok: false,
            content: null,
            errors: [`response too large (> ${MAX_BYTES} bytes)`],
            status: res.status,
          };
        }
        chunks.push(value);
      }
    }
    const buf = chunks.length
      ? Buffer.concat(chunks.map((c) => Buffer.from(c)))
      : Buffer.from(await res.text());
    const text = buf.toString('utf-8');
    let content;
    if (format === 'json') {
      try {
        content = JSON.parse(text);
      } catch {
        return {
          ok: false,
          content: null,
          errors: ['response is not valid JSON'],
          status: res.status,
        };
      }
    } else if (format === 'text') {
      content = htmlToText(text);
    } else {
      content = text;
    }
    return {
      ok: true,
      content,
      errors: [],
      status: res.status,
      contentType: res.headers.get('content-type'),
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, content: null, errors: [`timeout ${timeout}ms`], status: 0 };
    }
    return { ok: false, content: null, errors: [err.message], status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  fetchUrl,
  isAllowed,
  htmlToText,
};
