/**
 * genre-audit-config.js
 * ---------------------
 * Genre-specific audit dimension selection for ContinuityAuditor.
 *
 * InkOS uses 37 dimensions; we select 18 for Korean web novels
 * (15 universal + 3 Korean-specific).
 *
 * Each genre activates a subset — e.g., romance skips power scaling
 * and numerical consistency.
 */

const DIMENSIONS = {
  OOC: 1,                    // 캐릭터 이탈 (Out of Character)
  TIMELINE: 2,               // 타임라인 일관성
  LORE_CONFLICT: 3,          // 설정 충돌
  NUMERICAL: 4,              // 수치 일관성 (전력/레벨/소유물)
  HOOK_CHECK: 5,             // 복선 체크 (미회수/만기)
  PACING: 6,                 // 페이싱
  INFO_BOUNDARY: 7,          // 정보 경계 위반 (캐릭터가 모르는 정보 사용)
  DIALOGUE_AUTH: 8,          // 대화 진실성
  POV_CONSISTENCY: 9,        // 시점 일관성 (1인칭/3인칭 혼동)
  SUBPLOT_STAGNATION: 10,    // 서브플롯 정체
  ARC_FLATLINE: 11,          // 아크 평탄화
  SIDE_CHAR_DUMBING: 12,     // 조연 지능 저하
  CHRONICLE_DRIFT: 13,       // 유수장 (일기식 서술)
  CLICHE_DENSITY: 14,        // 상투 표현 밀도
  OUTLINE_DRIFT: 15,         // 아웃라인 편이 감지
  // Korean-specific
  HONORIFIC_CONSISTENCY: 16, // 존댓말 일관성 (높임법 수준 변동)
  AI_STYLE_DETECTION: 17,    // AI 문체 감지 (한편, 그러나, 그리하여)
  HANJA_OVERUSE: 18,         // 한자어 과다 사용
};

const DIMENSION_LABELS = {
  1:  { ko: 'OOC 검사',         en: 'OOC Check' },
  2:  { ko: '타임라인 검사',     en: 'Timeline Check' },
  3:  { ko: '설정 충돌',        en: 'Lore Conflict' },
  4:  { ko: '수치 일관성',      en: 'Numerical Consistency' },
  5:  { ko: '복선 검사',        en: 'Hook Check' },
  6:  { ko: '페이싱 검사',      en: 'Pacing Check' },
  7:  { ko: '정보 경계 위반',   en: 'Info Boundary Violation' },
  8:  { ko: '대화 진실성',      en: 'Dialogue Authenticity' },
  9:  { ko: '시점 일관성',      en: 'POV Consistency' },
  10: { ko: '서브플롯 정체',    en: 'Subplot Stagnation' },
  11: { ko: '아크 평탄화',      en: 'Arc Flatline' },
  12: { ko: '조연 지능 저하',   en: 'Side Char Dumbing' },
  13: { ko: '유수장',           en: 'Chronicle Drift' },
  14: { ko: '상투 표현',        en: 'Cliché Density' },
  15: { ko: '아웃라인 편이',    en: 'Outline Drift' },
  16: { ko: '존댓말 일관성',    en: 'Honorific Consistency' },
  17: { ko: 'AI 문체 감지',     en: 'AI Style Detection' },
  18: { ko: '한자어 과다',      en: 'Hanja Overuse' },
};

/**
 * Genre → active dimension IDs.
 * All dimensions are active for action genres (fantasy, martial_arts).
 * Lighter checks for character-driven genres (romance).
 */
const GENRE_DIMENSIONS = {
  fantasy:      [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],
  martial_arts: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],
  romance:      [1,2,3,5,6,8,9,11,13,14,15,16,17,18],     // no 4(numerical), 7(info boundary edge), 10(subplot), 12(side char)
  thriller:     [1,2,3,5,6,7,8,9,10,11,13,14,15,16,17,18], // no 4(numerical), 12(side char)
  sci_fi:       [1,2,3,4,5,6,7,8,9,10,11,14,15,16,17,18], // no 12(side char dumbing), 13(chronicle)
  general:      [1,2,3,5,6,8,9,11,13,14,15,16,17,18],      // minimal set
};

/**
 * Get active dimensions for a genre.
 * @param {string} genre
 * @returns {{ id: number, ko: string, en: string }[]}
 */
function getActiveDimensions(genre) {
  const ids = GENRE_DIMENSIONS[genre] || GENRE_DIMENSIONS.general;
  return ids.map(id => ({
    id,
    ko: DIMENSION_LABELS[id]?.ko || `Dim ${id}`,
    en: DIMENSION_LABELS[id]?.en || `Dim ${id}`,
  }));
}

/**
 * Get dimension label by ID.
 */
function getDimensionLabel(id, lang = 'ko') {
  return DIMENSION_LABELS[id]?.[lang] || `Dimension ${id}`;
}

module.exports = {
  DIMENSIONS,
  DIMENSION_LABELS,
  GENRE_DIMENSIONS,
  getActiveDimensions,
  getDimensionLabel,
};
