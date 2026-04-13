/**
 * PostWriteValidator.js
 * ---------------------
 * Zero-LLM-cost, rule-based validation for Korean web novels.
 * Runs immediately after writing, before any LLM-based evaluation.
 *
 * Catches structural issues that prompts alone cannot guarantee.
 */

/**
 * @typedef {Object} PostWriteViolation
 * @property {string} rule
 * @property {'error'|'warning'} severity
 * @property {string} description
 * @property {string} suggestion
 */

// ─── Korean fiction anti-patterns ───

// 놀람/전환 마커 (과다 사용 감지)
const SURPRISE_MARKERS = ['문득', '갑자기', '순간', '마치', '불현듯', '느닷없이', '홀연'];

// 메타 서술 (작가가 독자에게 직접 말하는 패턴)
const META_NARRATION_PATTERNS = [
  /이\s*이야기는/,
  /독자\s*여러분/,
  /다음\s*(?:장|회|편)에서/,
  /(?:여기서|이쯤에서)\s*(?:잠깐|잠시)/,
  /앞으로\s*(?:전개될|펼쳐질|이어질)/,
  /(?:이|그)\s*장면을\s*(?:보면|보자)/,
  /지금부터\s*(?:시작되는|펼쳐지는)/,
];

// 보고서/분석 용어 (소설 본문에 부적절)
const REPORT_TERMS = [
  '핵심 동기', '인지 부조화', '근본적 원인', '궁극적 목표',
  '행동 패턴', '심리적 기제', '감정적 반응', '본질적 문제',
  '전략적 판단', '객관적 사실', '주관적 해석', '논리적 귀결',
];

// 설교 단어 (작가의 직접 판단)
const SERMON_WORDS = [
  '당연히', '두말할 것 없이', '말할 것도 없이', '누가 봐도',
  '의심할 여지 없이', '분명한 사실은', '확실한 것은',
];

// 집단 반응 패턴 ("전원 경악" 류)
const COLLECTIVE_SHOCK_PATTERNS = [
  /(?:모두|모든\s*사람|일동|전원|주위\s*사람들)(?:이|가)?\s*(?:놀랐|경악|할말을\s*잃|얼어붙|숨을\s*멈|충격)/,
  /(?:장내|실내|주변)(?:가|이)?\s*(?:술렁|소란|웅성|조용|정적|침묵)/,
];

// "~가 아니라 ~이다" 남발 패턴
const NOT_BUT_PATTERN = /(?:이|가)\s*아니(?:라|었다)[^.。!?\n]{0,30}(?:이|였)다/g;

/**
 * Validate chapter content with rule-based checks (no LLM).
 * @param {string} content
 * @param {object} [genreProfile] - { fatigueWords?: string[] }
 * @returns {PostWriteViolation[]}
 */
function validatePostWrite(content, genreProfile = {}) {
  if (!content || content.length < 100) return [];

  const violations = [];

  // 1. 놀람 마커 과다 (1회/3000자 제한)
  let totalMarkers = 0;
  const markerHits = {};
  for (const word of SURPRISE_MARKERS) {
    const regex = new RegExp(word, 'g');
    const matches = content.match(regex);
    if (matches) {
      totalMarkers += matches.length;
      if (matches.length >= 2) markerHits[word] = matches.length;
    }
  }
  const markerLimit = Math.max(1, Math.floor(content.length / 3000));
  if (totalMarkers > markerLimit) {
    const detail = Object.entries(markerHits).map(([w, c]) => `"${w}"x${c}`).join(', ');
    violations.push({
      rule: '놀람마커과다',
      severity: 'warning',
      description: `놀람/전환 마커 ${totalMarkers}회 (한도 ${markerLimit}회/${content.length}자). ${detail}`,
      suggestion: '감각 묘사나 행동으로 전환. "갑자기" 대신 직접 사건을 묘사하세요.',
    });
  }

  // 2. 메타 서술 감지
  for (const pattern of META_NARRATION_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      violations.push({
        rule: '메타서술',
        severity: 'error',
        description: `메타 서술 감지: "${match[0]}"`,
        suggestion: '작가가 독자에게 직접 말하는 서술 삭제. 장면으로 보여주세요.',
      });
      break;
    }
  }

  // 3. 보고서 용어
  const foundTerms = REPORT_TERMS.filter(t => content.includes(t));
  if (foundTerms.length > 0) {
    violations.push({
      rule: '보고서용어',
      severity: 'error',
      description: `분석 보고서 용어: ${foundTerms.map(t => `"${t}"`).join(', ')}`,
      suggestion: '소설 본문에는 캐릭터의 행동/감정으로 표현. "핵심 동기" → 캐릭터가 직접 말하거나 행동으로.',
    });
  }

  // 4. 설교 단어
  const foundSermons = SERMON_WORDS.filter(w => content.includes(w));
  if (foundSermons.length > 0) {
    violations.push({
      rule: '작가설교',
      severity: 'warning',
      description: `설교 표현: ${foundSermons.map(w => `"${w}"`).join(', ')}`,
      suggestion: '독자에게 판단을 강요하지 마세요. 사건을 보여주고 독자가 스스로 판단하게.',
    });
  }

  // 5. 집단 반응 ("모두가 놀랐다")
  for (const pattern of COLLECTIVE_SHOCK_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      violations.push({
        rule: '집단반응',
        severity: 'warning',
        description: `집단 반응 클리셰: "${match[0]}"`,
        suggestion: '1~2명의 구체적 반응으로 교체. "모두가 놀랐다" → "영수가 커피잔을 떨어뜨렸다".',
      });
      break;
    }
  }

  // 6. 연속 "~했다" (6문장+)
  const sentences = content.split(/[.!?]\s*/).filter(s => s.length > 5);
  let consecutive = 0;
  let maxConsecutive = 0;
  for (const s of sentences) {
    if (/했다|였다|갔다|왔다|봤다|됐다|났다/.test(s)) {
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
    } else {
      consecutive = 0;
    }
  }
  if (maxConsecutive >= 6) {
    violations.push({
      rule: '연속과거형',
      severity: 'warning',
      description: `${maxConsecutive}문장 연속 "~했다/였다" 종결 — 리듬 단조`,
      suggestion: '현재형, 진행형, 명사형 종결을 섞으세요. "~했다" → "~하는 중이었다", "~인 셈이다".',
    });
  }

  // 7. 단락 과장 (300자 초과, 모바일 가독성)
  const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  const longParas = paragraphs.filter(p => p.length > 300);
  if (longParas.length >= 2) {
    violations.push({
      rule: '단락과장',
      severity: 'warning',
      description: `${longParas.length}개 단락이 300자 초과 — 모바일 가독성 저하`,
      suggestion: '긴 단락을 3~5줄로 분리. 행동/감정 전환점에서 줄바꿈.',
    });
  }

  // 8. "~가 아니라 ~이다" 남발
  const notButMatches = content.match(NOT_BUT_PATTERN);
  if (notButMatches && notButMatches.length >= 3) {
    violations.push({
      rule: '대조구문남발',
      severity: 'warning',
      description: `"~가 아니라 ~이다" 패턴 ${notButMatches.length}회`,
      suggestion: '직술문으로 교체. 대조 구문은 강조가 필요할 때만.',
    });
  }

  // 9. 장르별 피로 단어 (genreProfile에서)
  const fatigueWords = genreProfile.fatigueWords || [];
  for (const word of fatigueWords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = content.match(new RegExp(escaped, 'g'));
    if (matches && matches.length > 1) {
      violations.push({
        rule: '피로단어',
        severity: 'warning',
        description: `피로 단어 "${word}" ${matches.length}회 (장당 1회 제한)`,
        suggestion: `"${word}"를 다른 표현으로 교체하세요.`,
      });
    }
  }

  // 10. 챕터 번호 직접 언급
  const chapterRefs = content.match(/제\s*\d+\s*(?:장|화|편)|[Cc]hapter\s+\d+|[Ee]pisode\s+\d+/g);
  if (chapterRefs) {
    violations.push({
      rule: '챕터번호언급',
      severity: 'error',
      description: `본문에 챕터 번호 언급: ${[...new Set(chapterRefs)].join(', ')}`,
      suggestion: '캐릭터는 자신이 몇 장에 있는지 모릅니다. "그날 밤", "사건 이후"로 교체.',
    });
  }

  return violations;
}

module.exports = { validatePostWrite, SURPRISE_MARKERS, META_NARRATION_PATTERNS, REPORT_TERMS, SERMON_WORDS };
