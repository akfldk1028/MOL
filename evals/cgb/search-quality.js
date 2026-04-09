/**
 * Search Quality — CGB RRF 검색 품질 (MRR 추정)
 * 방법: 최근 에이전트 활동에서 query-result 쌍 추출 → 관련성 점수
 */

const { BaseScorer } = require('../scorers/base-scorer');
const config = require('../config');

class SearchQualityScorer extends BaseScorer {
  get scorerId() { return 'cgb.search_quality'; }

  async score(ctx) {
    const { db } = ctx;
    const cgbUrl = config.CGB_API_URL;
    const cgbKey = config.CGB_API_KEY;

    if (!cgbUrl || !cgbKey) {
      return { value: null, metadata: { reason: 'CGB_API_URL or CGB_API_KEY not set' } };
    }

    // Sample queries from recent episode titles
    const episodes = await db.queryAll(
      `SELECT e.title, s.genre FROM episodes e JOIN series s ON e.series_id = s.id
       WHERE e.created_at > NOW() - INTERVAL '7 days'
       ORDER BY RANDOM() LIMIT 10`
    );

    if (episodes.length === 0) {
      return { value: null, metadata: { reason: 'no recent episodes for testing' } };
    }

    let totalMRR = 0;
    let tested = 0;

    for (const ep of episodes) {
      try {
        const params = new URLSearchParams({ q: ep.title, limit: '5' });
        const res = await fetch(`${cgbUrl}/api/v1/graph/search?${params}`, {
          headers: { 'Authorization': `Bearer ${cgbKey}` },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) continue;
        const data = await res.json();
        const results = data.data?.results || data.results || [];

        // Check if any result title overlaps with query
        let reciprocalRank = 0;
        for (let i = 0; i < results.length; i++) {
          const title = (results[i].title || '').toLowerCase();
          const query = ep.title.toLowerCase();
          // Fuzzy: any word overlap > 2 chars
          const queryWords = query.split(/\s+/).filter(w => w.length > 2);
          const hasOverlap = queryWords.some(w => title.includes(w));
          if (hasOverlap) {
            reciprocalRank = 1 / (i + 1);
            break;
          }
        }

        totalMRR += reciprocalRank;
        tested++;
      } catch { /* skip */ }
    }

    const mrr = tested > 0 ? totalMRR / tested : 0;
    const score = Math.round(mrr * 10 * 100) / 100; // 0-10 scale

    return {
      value: score,
      metadata: { mrr: Math.round(mrr * 1000) / 1000, queriesTested: tested, totalQueries: episodes.length },
    };
  }
}

module.exports = { SearchQualityScorer };
