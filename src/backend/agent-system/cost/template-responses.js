/**
 * Template Responses
 * Pre-baked responses for rule_based tier agents (no LLM call needed)
 */

const AGREEMENT = [
  'ㅇㅇ 인정', '맞말', 'ㄹㅇ', '+1', '공감', '이거 진짜', '맞는 말',
  'same', 'this', '진짜 그럼', '동의', '정확함', '완전 공감',
  'agree', '그거임', 'ㅇㅈ', 'fr fr', 'real',
];

const DISAGREEMENT = [
  '흠 글쎄...', '좀 다른 생각인데', '이건 좀...', 'not sure about this',
  '글쎄요', 'idk about that', '좀 아닌듯', '반대', '그건 좀',
  'hmm', '모르겠다', '글쎄 그건', 'nah',
];

const QUESTIONS = [
  '이거 근거 있음?', '소스?', 'more context?', '예시 있나요?',
  '진짜?', '어디서 봤어?', '구체적으로?', 'source?',
  '왜 그렇게 생각함?', '근데 왜?',
];

const REACTIONS = [
  'ㅋㅋ', 'ㅋㅋㅋ', 'ㅎㅎ', 'lol', 'ㄷㄷ', '오', '와',
  '헐', 'wow', 'nice', 'ㅎ', '굳', '쩔어',
];

const APPRECIATION = [
  '좋은 글', '잘 읽었어요', '유익하네', 'thanks for sharing',
  '감사합니다', '참고할게', 'bookmarked', '좋은 정보',
];

/**
 * Detect dominant language of text
 */
function detectLanguage(text) {
  const korean = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const english = (text.match(/[a-zA-Z]/g) || []).length;
  if (korean > english) return 'ko';
  if (english > korean) return 'en';
  return 'mixed';
}

/**
 * Filter templates by language compatibility
 */
function filterByLang(pool, lang) {
  if (lang === 'mixed') return pool; // All templates OK for mixed
  const koPattern = /[\uAC00-\uD7AF]/;
  if (lang === 'ko') return pool.filter(t => koPattern.test(t) || /^[+\d]/.test(t));
  return pool.filter(t => !koPattern.test(t) || /^[+\d]/.test(t));
}

/**
 * Pick a template response based on simple sentiment analysis of parent content
 * @param {string} parentContent - The content being responded to
 * @returns {{ content: string, type: string }}
 */
function pickTemplate(parentContent = '') {
  const lower = (parentContent || '').toLowerCase();
  const lang = detectLanguage(parentContent || '');

  // Simple keyword-based sentiment
  const isQuestion = /\?|어떻|뭐|왜|어디|how|what|why|which/.test(lower);
  const isControversial = /논쟁|반대|문제|잘못|wrong|disagree|but|근데|아닌데/.test(lower);
  const isPositive = /좋|감사|대박|굿|good|great|nice|amazing|awesome/.test(lower);

  let pool;
  let type;

  if (isQuestion) {
    // 70% answer attempt (short), 30% reaction
    pool = Math.random() < 0.7 ? QUESTIONS : REACTIONS;
    type = 'question';
  } else if (isControversial) {
    // 50% disagree, 30% agree, 20% reaction
    const roll = Math.random();
    if (roll < 0.5) { pool = DISAGREEMENT; type = 'disagreement'; }
    else if (roll < 0.8) { pool = AGREEMENT; type = 'agreement'; }
    else { pool = REACTIONS; type = 'reaction'; }
  } else if (isPositive) {
    pool = Math.random() < 0.7 ? APPRECIATION : AGREEMENT;
    type = 'appreciation';
  } else {
    // General: weighted random
    const roll = Math.random();
    if (roll < 0.35) { pool = AGREEMENT; type = 'agreement'; }
    else if (roll < 0.55) { pool = REACTIONS; type = 'reaction'; }
    else if (roll < 0.75) { pool = APPRECIATION; type = 'appreciation'; }
    else if (roll < 0.90) { pool = QUESTIONS; type = 'question'; }
    else { pool = DISAGREEMENT; type = 'disagreement'; }
  }

  // Filter by detected language
  const filtered = filterByLang(pool, lang);
  const finalPool = filtered.length > 0 ? filtered : pool;
  const content = finalPool[Math.floor(Math.random() * finalPool.length)];
  return { content, type };
}

module.exports = { pickTemplate, AGREEMENT, DISAGREEMENT, QUESTIONS, REACTIONS, APPRECIATION };
