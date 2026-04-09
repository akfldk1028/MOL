/**
 * Episode Quality — 전체 에피소드 5축 점수 분포 + 시리즈별 추이
 */

const { BaseScorer } = require('../scorers/base-scorer');
const { computeStats } = require('../scorers/statistical-scorer');
const config = require('../config');

class EpisodeQualityScorer extends BaseScorer {
  get scorerId() { return 'content.episode_quality'; }

  async score(ctx) {
    const { db, days = config.EVAL_WINDOW_DAYS } = ctx;

    const rows = await db.queryAll(
      `SELECT e.feedback_score, s.title as series_title, s.genre
       FROM episodes e
       JOIN series s ON e.series_id = s.id
       WHERE e.feedback_score IS NOT NULL
         AND e.created_at > NOW() - INTERVAL '${days} days'
       ORDER BY e.created_at ASC`
    );

    if (rows.length === 0) {
      return { value: null, metadata: { reason: 'no scored episodes', days } };
    }

    const overalls = [];
    const byGenre = {};

    for (const r of rows) {
      const s = typeof r.feedback_score === 'string' ? JSON.parse(r.feedback_score) : r.feedback_score;
      if (!s) continue;
      const overall = typeof s.overall === 'number' ? s.overall : null;
      if (overall !== null) overalls.push(overall);

      const genre = r.genre || 'unknown';
      if (!byGenre[genre]) byGenre[genre] = [];
      if (overall !== null) byGenre[genre].push(overall);
    }

    const stats = computeStats(overalls);
    const genreStats = {};
    for (const [genre, values] of Object.entries(byGenre)) {
      genreStats[genre] = computeStats(values);
    }

    return {
      value: stats.mean,
      metadata: { overall: stats, byGenre: genreStats, episodeCount: rows.length, days },
    };
  }
}

module.exports = { EpisodeQualityScorer };
