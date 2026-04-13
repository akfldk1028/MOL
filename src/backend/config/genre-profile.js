/**
 * genre-profile.js
 * ----------------
 * Unified genre configuration: audit dimensions + length specs + fatigue words + rules.
 * Merges genre-audit-config.js + length-governance.js + InkOS GenreProfile fields.
 *
 * Single entry point: getGenreProfile(genre) returns everything.
 */

const { GENRE_DIMENSIONS, DIMENSION_LABELS, getActiveDimensions, getDimensionLabel } = require('./genre-audit-config');
const { GENRE_LENGTH_SPECS, getLengthSpec, countKoreanWords, getNormalizeMode, isOutsideHardRange } = require('./length-governance');

/**
 * Genre-specific extended profile.
 */
const GENRE_PROFILES = {
  fantasy: {
    name: '판타지',
    chapterTypes: ['일상', '탐색', '전투', '수련', '각성', '위기', '귀환'],
    fatigueWords: ['문득', '갑자기', '순간', '마치', '한편', '그러나'],
    numericalSystem: false,
    powerScaling: true,
    pacingRule: '전투 2연속 후 반드시 이완 1회. 각성 장면은 최소 3장 간격.',
    satisfactionTypes: ['성장', '반전', '각성', '동료 구출', '비밀 해금'],
  },
  martial_arts: {
    name: '무협',
    chapterTypes: ['일상', '수련', '비무', '쟁탈', '음모', '각성', '강호행'],
    fatigueWords: ['문득', '갑자기', '순간', '한편', '그리하여', '내공이'],
    numericalSystem: true,
    powerScaling: true,
    pacingRule: '비무 2연속 후 강호행 또는 일상. 수련 장면은 최소 2장 간격.',
    satisfactionTypes: ['무공 돌파', '복수', '비급 획득', '사부 인정', '강적 격파'],
  },
  romance: {
    name: '로맨스',
    chapterTypes: ['일상', '만남', '갈등', '화해', '이벤트', '고백', '위기'],
    fatigueWords: ['문득', '갑자기', '가슴이 뛰었다', '심장이 멎었다', '얼굴이 붉어졌다'],
    numericalSystem: false,
    powerScaling: false,
    pacingRule: '감정선 3단계: 설렘→갈등→화해. 고백 전 반드시 위기 1회.',
    satisfactionTypes: ['설렘', '질투', '오해 해소', '고백', '재회'],
  },
  thriller: {
    name: '스릴러',
    chapterTypes: ['단서', '추적', '대치', '반전', '도주', '심문', '진실'],
    fatigueWords: ['갑자기', '순간', '소름이', '등골이', '심장이'],
    numericalSystem: false,
    powerScaling: false,
    pacingRule: '긴장 3연속 후 이완 1회. 반전은 최소 5장 간격. 단서는 매 장 1개.',
    satisfactionTypes: ['반전', '단서 연결', '범인 정체', '탈출', '정의 구현'],
  },
  sci_fi: {
    name: 'SF',
    chapterTypes: ['탐사', '발견', '위기', '기술', '접촉', '도주', '귀환'],
    fatigueWords: ['문득', '갑자기', '한편', '그러나', '시스템이'],
    numericalSystem: false,
    powerScaling: false,
    pacingRule: '기술 설명 2연속 금지. 발견 후 반드시 인간 드라마 1회.',
    satisfactionTypes: ['발견', '기술 돌파', '생존', '접촉', '귀환'],
  },
  general: {
    name: '일반',
    chapterTypes: ['일상', '사건', '갈등', '해결', '전환'],
    fatigueWords: ['문득', '갑자기', '한편', '그러나'],
    numericalSystem: false,
    powerScaling: false,
    pacingRule: '단조로운 전개 3연속 금지.',
    satisfactionTypes: ['해결', '성장', '관계 변화'],
  },
};

/**
 * Get complete genre profile — single entry point.
 * @param {string} genre
 * @returns {{ name, chapterTypes, fatigueWords, numericalSystem, powerScaling, pacingRule, satisfactionTypes, auditDimensions, lengthSpec }}
 */
function getGenreProfile(genre) {
  const profile = GENRE_PROFILES[genre] || GENRE_PROFILES.general;
  const dims = getActiveDimensions(genre);
  const lengthSpec = getLengthSpec(genre);

  return {
    ...profile,
    genre: genre || 'general',
    auditDimensions: dims,
    lengthSpec,
  };
}

module.exports = {
  GENRE_PROFILES,
  getGenreProfile,
  // Re-export for backward compat
  getActiveDimensions,
  getDimensionLabel,
  getLengthSpec,
  countKoreanWords,
  getNormalizeMode,
  isOutsideHardRange,
  GENRE_DIMENSIONS,
  DIMENSION_LABELS,
  GENRE_LENGTH_SPECS,
};
