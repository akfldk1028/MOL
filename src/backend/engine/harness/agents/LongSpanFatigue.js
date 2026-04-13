/**
 * LongSpanFatigue.js
 * ------------------
 * Cross-chapter fatigue detection for serial novels.
 * Analyzes patterns across recent episodes to prevent monotony.
 *
 * 3 checks:
 *   1. Chapter type repetition (e.g., 3x combat in a row)
 *   2. Mood monotony (sustained high tension without release)
 *   3. Opening/ending pattern similarity (Dice coefficient)
 */

const LOOKBACK = 4; // analyze last N episodes
const SIMILARITY_THRESHOLD = 0.72;
const TYPE_REPEAT_THRESHOLD = 3;
const MOOD_HIGH_TENSION_THRESHOLD = 3;

/**
 * @typedef {Object} FatigueIssue
 * @property {'warning'} severity
 * @property {string} category
 * @property {string} description
 * @property {string} suggestion
 */

/**
 * Analyze fatigue across recent episodes.
 * @param {object} params
 * @param {Array<{episode_number:number, title:string, script_content:string, mood?:string, chapterType?:string}>} params.episodes - recent episodes (newest last)
 * @param {string} [params.currentContent] - current chapter content (for boundary pattern check)
 * @param {string[]} [params.chapterTypes] - valid chapter types for this genre
 * @returns {{ issues: FatigueIssue[], suggestions: string[] }}
 */
function analyzeFatigue({ episodes, currentContent, chapterTypes }) {
  const issues = [];
  const suggestions = [];
  const recent = (episodes || []).slice(-LOOKBACK);

  if (recent.length < 2) {
    return { issues, suggestions };
  }

  // ─── 1. Chapter type repetition ───
  if (recent.length >= TYPE_REPEAT_THRESHOLD) {
    const types = recent.map(ep => ep.chapterType || guessChapterType(ep.script_content || ep.title));
    const lastN = types.slice(-TYPE_REPEAT_THRESHOLD);
    const allSame = lastN.every(t => t === lastN[0] && t !== 'unknown');
    if (allSame) {
      issues.push({
        severity: 'warning',
        category: '챕터타입 반복',
        description: `최근 ${TYPE_REPEAT_THRESHOLD}화 연속 "${lastN[0]}" 타입 — 전개 단조`,
        suggestion: `다음 장은 다른 타입으로 전환하세요. ${suggestNextType(lastN[0], chapterTypes)}`,
      });
      suggestions.push(`이번 장은 "${lastN[0]}" 대신 다른 전개 유형으로 쓰세요.`);
    }
  }

  // ─── 2. Mood monotony ───
  if (recent.length >= MOOD_HIGH_TENSION_THRESHOLD) {
    const moods = recent.map(ep => ep.mood || guessMood(ep.script_content));
    const lastN = moods.slice(-MOOD_HIGH_TENSION_THRESHOLD);
    const allTense = lastN.every(m => ['긴장', '전투', '위기', 'tension', 'action', 'crisis'].includes(m));
    if (allTense) {
      issues.push({
        severity: 'warning',
        category: '분위기 고압 연속',
        description: `최근 ${MOOD_HIGH_TENSION_THRESHOLD}화 연속 고압 분위기 (${lastN.join('→')})`,
        suggestion: '이완 장면을 넣으세요 — 일상, 유머, 대화, 회상 등으로 숨 돌리기.',
      });
      suggestions.push('이번 장에 이완/온기/유머 장면을 반드시 포함하세요.');
    }
  }

  // ─── 3. Opening/ending pattern similarity ───
  if (recent.length >= 3 && currentContent) {
    const bodies = [...recent.slice(-2).map(ep => ep.script_content || ''), currentContent];
    const validBodies = bodies.filter(b => b.length > 100);

    if (validBodies.length >= 3) {
      // Opening similarity
      const openings = validBodies.map(b => extractBoundary(b, 'opening'));
      const openSim = [
        diceCoefficient(normalize(openings[0]), normalize(openings[1])),
        diceCoefficient(normalize(openings[1]), normalize(openings[2])),
      ];
      if (Math.min(...openSim) >= SIMILARITY_THRESHOLD) {
        issues.push({
          severity: 'warning',
          category: '도입부 동형',
          description: `최근 3화 도입부 유사도 ${openSim.map(s => s.toFixed(2)).join('/')} — 패턴화`,
          suggestion: '다음 장은 다른 도입으로 시작. 행동/결과/이상 상황으로 시작하세요.',
        });
        suggestions.push('이번 장 도입부를 이전 장과 완전히 다른 방식으로 시작하세요.');
      }

      // Ending similarity
      const endings = validBodies.map(b => extractBoundary(b, 'ending'));
      const endSim = [
        diceCoefficient(normalize(endings[0]), normalize(endings[1])),
        diceCoefficient(normalize(endings[1]), normalize(endings[2])),
      ];
      if (Math.min(...endSim) >= SIMILARITY_THRESHOLD) {
        issues.push({
          severity: 'warning',
          category: '결말 동형',
          description: `최근 3화 결말 유사도 ${endSim.map(s => s.toFixed(2)).join('/')} — 패턴화`,
          suggestion: '다음 장 결말을 다르게. 행동 결과/결단/새 변수로 마무리하세요.',
        });
        suggestions.push('이번 장 결말을 이전 장과 다른 패턴으로 쓰세요.');
      }
    }
  }

  return { issues, suggestions };
}

// ─── Helpers ───

function guessChapterType(text) {
  if (!text) return 'unknown';
  const lower = text.toLowerCase ? text.toLowerCase() : text;
  if (/전투|싸움|공격|방어|검|마법|폭발/.test(lower)) return '전투';
  if (/수련|훈련|연습|성장|돌파/.test(lower)) return '수련';
  if (/일상|카페|집|학교|회사|식사/.test(lower)) return '일상';
  if (/만남|재회|소개|첫/.test(lower)) return '만남';
  if (/위기|긴급|도주|추격/.test(lower)) return '위기';
  if (/고백|사랑|키스|포옹/.test(lower)) return '고백';
  return 'unknown';
}

function guessMood(text) {
  if (!text) return 'unknown';
  if (/전투|공격|폭발|비명|피|죽/.test(text)) return '전투';
  if (/긴장|두려|공포|위험|급박/.test(text)) return '긴장';
  if (/슬프|눈물|이별|죽음/.test(text)) return '슬픔';
  if (/웃|유머|장난|농담/.test(text)) return '유머';
  if (/따뜻|편안|행복|미소/.test(text)) return '온기';
  return 'unknown';
}

function suggestNextType(currentType, chapterTypes) {
  const defaults = ['일상', '만남', '전환', '이완'];
  const pool = (chapterTypes || defaults).filter(t => t !== currentType);
  return pool.length > 0 ? `추천: ${pool.slice(0, 3).join(', ')}` : '';
}

function extractBoundary(content, type) {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
  const flat = lines.join(' ');
  const sentences = flat.split(/[.!?]\s+/).map(s => s.trim()).filter(s => s.length > 5);
  if (sentences.length === 0) return '';
  return type === 'opening' ? sentences[0] : sentences[sentences.length - 1];
}

function normalize(text) {
  if (!text) return '';
  return text.replace(/[^가-힣a-z0-9]/gi, '').toLowerCase();
}

function diceCoefficient(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = buildBigrams(a);
  const bigramsB = buildBigrams(b);
  let overlap = 0;

  for (const [bg, count] of bigramsA) {
    overlap += Math.min(count, bigramsB.get(bg) || 0);
  }

  const totalA = [...bigramsA.values()].reduce((s, v) => s + v, 0);
  const totalB = [...bigramsB.values()].reduce((s, v) => s + v, 0);
  return (2 * overlap) / (totalA + totalB);
}

function buildBigrams(str) {
  const map = new Map();
  for (let i = 0; i < str.length - 1; i++) {
    const bg = str.slice(i, i + 2);
    map.set(bg, (map.get(bg) || 0) + 1);
  }
  return map;
}

module.exports = { analyzeFatigue, diceCoefficient, guessChapterType, guessMood };
