/**
 * Blog Watch Skill
 *
 * Monitors RSS/Atom feeds for new content. Agents use this to
 * discover trending topics, new works, and literary/music news.
 *
 * Based on: openclaw/skills/blogwatcher
 * Adapted: pure Node.js RSS/Atom parser (no external CLI needed).
 */

// Lightweight XML tag extractor (no xml2js dependency)
function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function extractAllBlocks(xml, tag) {
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'gi');
  return xml.match(re) || [];
}

function extractAttr(xml, attr) {
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}

function stripHtml(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
}

/**
 * Fetch and parse an RSS/Atom feed
 * @param {string} feedUrl - RSS or Atom feed URL
 * @param {object} [opts]
 * @param {number} [opts.limit=10] - Max items to return
 * @returns {Promise<Array<{ title: string, link: string, published: string, summary: string }>>}
 */
async function fetchFeed(feedUrl, opts = {}) {
  const limit = opts.limit || 10;

  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'clickaround-bot/1.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Feed fetch failed: HTTP ${res.status}`);
  const xml = await res.text();

  // Try JSON feed first
  if (xml.trim().startsWith('{')) {
    try {
      const json = JSON.parse(xml);
      return (json.items || []).slice(0, limit).map(item => ({
        title: item.title || '',
        link: item.url || item.external_url || '',
        published: item.date_published || '',
        summary: (item.content_text || item.summary || '').slice(0, 500),
      }));
    } catch { /* not JSON, continue */ }
  }

  // RSS 2.0 — has <item> blocks
  const rssItems = extractAllBlocks(xml, 'item');
  if (rssItems.length > 0) {
    return rssItems.slice(0, limit).map(block => ({
      title: stripHtml(extractTag(block, 'title')),
      link: stripHtml(extractTag(block, 'link')),
      published: stripHtml(extractTag(block, 'pubDate')),
      summary: stripHtml(extractTag(block, 'description')).slice(0, 500),
    }));
  }

  // Atom — has <entry> blocks
  const atomEntries = extractAllBlocks(xml, 'entry');
  if (atomEntries.length > 0) {
    return atomEntries.slice(0, limit).map(block => ({
      title: stripHtml(extractTag(block, 'title')),
      link: extractAttr(block, 'href') || stripHtml(extractTag(block, 'link')),
      published: stripHtml(extractTag(block, 'published') || extractTag(block, 'updated')),
      summary: stripHtml(extractTag(block, 'summary') || extractTag(block, 'content')).slice(0, 500),
    }));
  }

  throw new Error('Unrecognized feed format');
}

/**
 * Scan multiple feeds for new articles
 * @param {Array<{ name: string, url: string }>} feeds
 * @param {object} [opts]
 * @returns {Promise<Array<{ feed: string, articles: Array }>>}
 */
async function scanFeeds(feeds, opts = {}) {
  const results = [];
  for (const feed of feeds) {
    try {
      const articles = await fetchFeed(feed.url, opts);
      results.push({ feed: feed.name, articles });
    } catch (err) {
      results.push({ feed: feed.name, articles: [], error: err.message });
    }
  }
  return results;
}

// Default feeds for content discovery
const DEFAULT_FEEDS = [
  { name: 'Hacker News', url: 'https://hnrss.org/newest?points=100' },
  { name: 'Reddit Writing', url: 'https://www.reddit.com/r/writing/.rss?limit=10' },
];

function resolve() {
  return {
    available: true,
    skillHint: 'You can monitor blogs and RSS feeds to discover trending topics and new content for discussion.',
    defaultFeeds: DEFAULT_FEEDS,
  };
}

module.exports = { fetchFeed, scanFeeds, resolve, DEFAULT_FEEDS };
