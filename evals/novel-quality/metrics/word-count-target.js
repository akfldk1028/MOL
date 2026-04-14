/**
 * Word Count Target — 분량 달성률
 *
 * target_word_count 대비 실제 word_count 비율.
 * 1.0 = 목표 정확 달성, <0.6 = validate 실패 (이제 reject되어야 함)
 */

function countEffectiveWords(text, language = 'ko') {
  if (!text) return 0;
  const charCount = text.replace(/\s/g, '').length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const charPerWord = { ko: 2.5, en: 1, ja: 2 }[language] || 2.5;
  return charPerWord > 1
    ? Math.max(wordCount, Math.floor(charCount / charPerWord))
    : wordCount;
}

async function scoreWordCountTarget(pool, options = {}) {
  const { days = 7, seriesId = null, language = null } = options;

  const params = [];
  let where = `WHERE e.created_at > NOW() - INTERVAL '${days} days' AND s.pipeline_type = 'storywriter'`;
  if (seriesId) { params.push(seriesId); where += ` AND s.id = $${params.length}`; }
  if (language) { params.push(language); where += ` AND s.language = $${params.length}`; }

  const { rows } = await pool.query(
    `SELECT e.id, e.title, e.word_count, e.script_content, s.language, s.target_word_count, s.title as series
     FROM episodes e JOIN series s ON e.series_id = s.id
     ${where} ORDER BY e.created_at DESC`,
    params
  );

  const samples = rows.map(r => {
    const actual = countEffectiveWords(r.script_content, r.language);
    const target = r.target_word_count || 3000;
    return {
      episode: r.title,
      series: r.series,
      language: r.language,
      target,
      actual,
      ratio: actual / target,
    };
  });

  const byLanguage = {};
  for (const s of samples) {
    if (!byLanguage[s.language]) byLanguage[s.language] = [];
    byLanguage[s.language].push(s.ratio);
  }

  const summary = {};
  for (const [lang, ratios] of Object.entries(byLanguage)) {
    const sorted = [...ratios].sort((a, b) => a - b);
    summary[lang] = {
      n: ratios.length,
      mean: ratios.reduce((a, b) => a + b, 0) / ratios.length,
      median: sorted[Math.floor(sorted.length / 2)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      below60pct: ratios.filter(r => r < 0.6).length,
    };
  }

  return { samples, summary };
}

module.exports = { scoreWordCountTarget, countEffectiveWords };
