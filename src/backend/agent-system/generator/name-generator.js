/**
 * Name Generator
 * Creates unique agent names based on speaking style and archetype
 */

const PREFIXES = {
  casual_korean: [
    '별빛', '파도', '새벽', '달빛', '구름', '하늘', '바람', '불꽃',
    '안개', '폭풍', '숲속', '밤하늘', '노을', '햇살', '봄비',
  ],
  internet_korean: [
    '갓', '꿀', '핵', '찐', '킹', '빅', '뉴', '올',
  ],
  english_casual: [
    'zero', 'flux', 'drift', 'pulse', 'echo', 'void', 'glitch', 'spark',
    'byte', 'node', 'crash', 'blur', 'rust', 'mint', 'haze',
  ],
  polite_korean: [
    '정원', '서재', '이음', '다솜', '나래', '소담', '하람', '아름',
  ],
  academic_korean: [
    '석학', '논객', '탐구', '사유', '통찰', '분석', '연구', '고찰',
  ],
  mixed_ko_en: [
    'neo', 'mini', 'hyper', 'ultra', 'meta', 'proto', 'anti', 'super',
  ],
  archaic_korean: [
    '고요', '운명', '적월', '흑야', '백화', '청풍', '암흑', '낙엽',
  ],
};

const SUFFIXES = {
  casual_korean: [
    '토끼', '고양이', '여우', '곰', '사자', '독수리', '늑대', '용',
    '달팽이', '나비', '벌', '매', '두루미',
  ],
  internet_korean: [
    '러', '충', '장인', '마스터', '봇', '킹', '맨', '워커',
  ],
  english_casual: [
    '_runner', '_walker', '_hawk', '_wolf', '_fox', '_byte', '_mind',
    '_edge', '_core', '_fish', '_storm', '_fire', '_ice', '_ray',
  ],
  polite_korean: [
    '님', '선생', '작가', '님들', '벗',
  ],
  academic_korean: [
    '자', '인', '사', '원',
  ],
  mixed_ko_en: [
    '_cat', '_fox', '봇', '_ai', '_x', '_v2', '러',
  ],
  archaic_korean: [
    '검', '화', '룡', '성', '월', '풍', '혼',
  ],
};

const CONNECTOR_STYLES = {
  casual_korean: ['', '_', '.'],
  internet_korean: ['', '_'],
  english_casual: ['_', '.', '-'],
  polite_korean: ['', '_'],
  academic_korean: ['_', ''],
  mixed_ko_en: ['_', '.', ''],
  archaic_korean: ['', '_'],
};

function generateName(language, existingNames = new Set()) {
  const prefixPool = PREFIXES[language] || PREFIXES.english_casual;
  const suffixPool = SUFFIXES[language] || SUFFIXES.english_casual;
  const connectors = CONNECTOR_STYLES[language] || ['_'];

  for (let attempt = 0; attempt < 50; attempt++) {
    const prefix = prefixPool[Math.floor(Math.random() * prefixPool.length)];
    const suffix = suffixPool[Math.floor(Math.random() * suffixPool.length)];
    const conn = connectors[Math.floor(Math.random() * connectors.length)];

    // Sometimes add a number suffix for uniqueness
    const numSuffix = Math.random() < 0.3 ? Math.floor(Math.random() * 99) : '';

    const name = `${prefix}${conn}${suffix}${numSuffix}`.toLowerCase().replace(/[^a-z0-9가-힣_.-]/g, '_');

    if (name.length >= 3 && name.length <= 24 && !existingNames.has(name)) {
      return name;
    }
  }

  // Fallback: random hex
  const hex = Math.random().toString(36).substring(2, 8);
  return `agent_${hex}`;
}

module.exports = { generateName, PREFIXES, SUFFIXES };
