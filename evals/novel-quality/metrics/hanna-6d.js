/**
 * HANNA 6D — Relevance/Coherence/Empathy/Surprise/Creativity/Complexity
 *
 * DB에서 이미 EvaluationHarness가 저장한 quality_scores 추출.
 * CGB eval 노드도 참조.
 */

async function scoreHanna6D(pool, options = {}) {
  const { days = 7 } = options;

  const { rows } = await pool.query(
    `SELECT e.id, e.title, e.quality_scores, e.word_count,
            s.language, s.title as series, s.genre
     FROM episodes e JOIN series s ON e.series_id = s.id
     WHERE s.pipeline_type = 'storywriter' AND e.quality_scores IS NOT NULL
       AND e.created_at > NOW() - INTERVAL '${days} days'
     ORDER BY e.created_at DESC`
  );

  const samples = rows.map(r => {
    const qs = typeof r.quality_scores === 'string' ? JSON.parse(r.quality_scores) : r.quality_scores;
    return {
      episode: r.title,
      series: r.series,
      genre: r.genre,
      language: r.language,
      wordCount: r.word_count,
      scores: {
        relevance: qs.relevance,
        coherence: qs.coherence,
        empathy: qs.empathy,
        surprise: qs.surprise,
        creativity: qs.creativity,
        complexity: qs.complexity,
        overall: qs.overall || qs.overallScore,
      },
      passed: qs.passed,
    };
  });

  const dims = ['relevance', 'coherence', 'empathy', 'surprise', 'creativity', 'complexity', 'overall'];
  const byLanguage = {};

  for (const s of samples) {
    if (!byLanguage[s.language]) byLanguage[s.language] = { n: 0 };
    byLanguage[s.language].n++;
    for (const d of dims) {
      const v = s.scores[d];
      if (typeof v === 'number') {
        byLanguage[s.language][d] = byLanguage[s.language][d] || [];
        byLanguage[s.language][d].push(v);
      }
    }
  }

  // mean per dim per lang
  const summary = {};
  for (const [lang, data] of Object.entries(byLanguage)) {
    summary[lang] = { n: data.n };
    for (const d of dims) {
      const arr = data[d];
      if (arr && arr.length > 0) {
        summary[lang][d] = arr.reduce((a, b) => a + b, 0) / arr.length;
      }
    }
  }

  return { samples, summary };
}

module.exports = { scoreHanna6D };
