/**
 * Language Purity — 언어 오염 비율
 *
 * 각 언어에서 기대하는 문자 vs 오염 문자 비율.
 * ko: 한글 높음 + CJK(중/일) 낮아야
 * en: 라틴 높음 + CJK 전체 낮아야
 * ja: 일본어(히/카/한자) 높음 + 한글 낮아야
 */

const LANG_SCRIPTS = {
  ko: {
    valid: /[\uAC00-\uD7AF]/g,              // Hangul
    pollution: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g, // Chinese/Hiragana/Katakana
  },
  en: {
    valid: /[a-zA-Z]/g,
    pollution: /[\uAC00-\uD7AF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g,
  },
  ja: {
    valid: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, // Hiragana+Katakana+Kanji
    pollution: /[\uAC00-\uD7AF]/g,                        // Korean pollution
  },
};

function computePurity(text, language = 'ko') {
  if (!text) return { valid: 0, pollution: 0, purity: 0, total: 0 };
  const cfg = LANG_SCRIPTS[language] || LANG_SCRIPTS.ko;
  const validMatches = text.match(cfg.valid) || [];
  const pollMatches = text.match(cfg.pollution) || [];
  const total = validMatches.length + pollMatches.length;
  return {
    valid: validMatches.length,
    pollution: pollMatches.length,
    total,
    purity: total === 0 ? 0 : validMatches.length / total,
  };
}

async function scoreLanguagePurity(pool, options = {}) {
  const { days = 7 } = options;

  const { rows } = await pool.query(
    `SELECT e.id, e.title, e.script_content, s.language, s.title as series
     FROM episodes e JOIN series s ON e.series_id = s.id
     WHERE e.created_at > NOW() - INTERVAL '${days} days' AND s.pipeline_type = 'storywriter'
     ORDER BY e.created_at DESC`
  );

  const samples = rows.map(r => ({
    episode: r.title,
    series: r.series,
    language: r.language,
    ...computePurity(r.script_content, r.language),
  }));

  const byLanguage = {};
  for (const s of samples) {
    if (!byLanguage[s.language]) byLanguage[s.language] = [];
    byLanguage[s.language].push(s.purity);
  }

  const summary = {};
  for (const [lang, purities] of Object.entries(byLanguage)) {
    summary[lang] = {
      n: purities.length,
      meanPurity: purities.reduce((a, b) => a + b, 0) / purities.length,
      perfectPurity: purities.filter(p => p >= 0.99).length,
      contaminated: purities.filter(p => p < 0.8).length,
    };
  }

  return { samples, summary };
}

module.exports = { scoreLanguagePurity, computePurity };
