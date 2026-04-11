/**
 * youtube-fetcher.js
 * ------------------
 * YouTube Data API v3 wrapper for the `scout` agent.
 *
 * Endpoints used:
 *   - videos.list       — video stats (views, likes, comments, duration)
 *   - channels.list     — channel metadata + aggregate stats
 *   - search.list       — trending / competitor search
 *   - commentThreads    — top comments for sentiment analysis
 *
 * Requires YOUTUBE_API_KEY env var. Returns stub data if missing
 * (so tests don't fail in CI without the key).
 */

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

function getKey() {
  return process.env.YOUTUBE_API_KEY || '';
}

/**
 * Fetch wrapper with simple in-memory cache (1 hour TTL).
 */
const _cache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

async function cachedFetch(url) {
  const now = Date.now();
  const cached = _cache.get(url);
  if (cached && now - cached.ts < CACHE_TTL) {
    return cached.data;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`youtube-fetcher: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  _cache.set(url, { data, ts: now });
  return data;
}

/**
 * Get video statistics for one or more video IDs.
 * @param {string|string[]} videoIds
 * @returns {Promise<{ ok, videos, errors }>}
 */
async function fetchVideoStats(videoIds) {
  const ids = Array.isArray(videoIds) ? videoIds.join(',') : videoIds;
  const key = getKey();
  if (!key) {
    return {
      ok: false,
      videos: [],
      errors: ['YOUTUBE_API_KEY not set — returning stub data'],
      stub: true,
    };
  }
  try {
    const url = `${YOUTUBE_API}/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${key}`;
    const data = await cachedFetch(url);
    return {
      ok: true,
      videos: (data.items || []).map((item) => ({
        id: item.id,
        title: item.snippet?.title,
        channelId: item.snippet?.channelId,
        publishedAt: item.snippet?.publishedAt,
        viewCount: Number(item.statistics?.viewCount || 0),
        likeCount: Number(item.statistics?.likeCount || 0),
        commentCount: Number(item.statistics?.commentCount || 0),
        duration: item.contentDetails?.duration,
        tags: item.snippet?.tags || [],
      })),
      errors: [],
    };
  } catch (err) {
    return { ok: false, videos: [], errors: [err.message] };
  }
}

/**
 * Get channel stats (aggregate views, subscribers, etc.).
 */
async function fetchChannelStats(channelId) {
  const key = getKey();
  if (!key) {
    return {
      ok: false,
      channel: null,
      errors: ['YOUTUBE_API_KEY not set — returning stub data'],
      stub: true,
    };
  }
  try {
    const url = `${YOUTUBE_API}/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key}`;
    const data = await cachedFetch(url);
    const item = (data.items || [])[0];
    if (!item) return { ok: false, channel: null, errors: ['channel not found'] };
    return {
      ok: true,
      channel: {
        id: item.id,
        title: item.snippet?.title,
        description: item.snippet?.description,
        publishedAt: item.snippet?.publishedAt,
        viewCount: Number(item.statistics?.viewCount || 0),
        subscriberCount: Number(item.statistics?.subscriberCount || 0),
        videoCount: Number(item.statistics?.videoCount || 0),
        uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads,
      },
      errors: [],
    };
  } catch (err) {
    return { ok: false, channel: null, errors: [err.message] };
  }
}

/**
 * Search for trending/competitor videos.
 */
async function searchVideos({ query, maxResults = 10, order = 'viewCount', publishedAfter = null }) {
  const key = getKey();
  if (!key) {
    return {
      ok: false,
      results: [],
      errors: ['YOUTUBE_API_KEY not set — returning stub data'],
      stub: true,
    };
  }
  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      maxResults: String(maxResults),
      order,
      type: 'video',
      key,
    });
    if (publishedAfter) params.set('publishedAfter', publishedAfter);
    const url = `${YOUTUBE_API}/search?${params.toString()}`;
    const data = await cachedFetch(url);
    return {
      ok: true,
      results: (data.items || []).map((item) => ({
        videoId: item.id?.videoId,
        title: item.snippet?.title,
        channelId: item.snippet?.channelId,
        channelTitle: item.snippet?.channelTitle,
        publishedAt: item.snippet?.publishedAt,
        description: item.snippet?.description,
      })),
      errors: [],
    };
  } catch (err) {
    return { ok: false, results: [], errors: [err.message] };
  }
}

/**
 * Fetch top comments for sentiment analysis.
 */
async function fetchComments(videoId, maxResults = 20) {
  const key = getKey();
  if (!key) {
    return { ok: false, comments: [], errors: ['YOUTUBE_API_KEY not set'], stub: true };
  }
  try {
    const url = `${YOUTUBE_API}/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=relevance&key=${key}`;
    const data = await cachedFetch(url);
    return {
      ok: true,
      comments: (data.items || []).map((item) => {
        const top = item.snippet?.topLevelComment?.snippet;
        return {
          author: top?.authorDisplayName,
          text: top?.textDisplay,
          likeCount: Number(top?.likeCount || 0),
          publishedAt: top?.publishedAt,
        };
      }),
      errors: [],
    };
  } catch (err) {
    return { ok: false, comments: [], errors: [err.message] };
  }
}

module.exports = {
  fetchVideoStats,
  fetchChannelStats,
  searchVideos,
  fetchComments,
};
