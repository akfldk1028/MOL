/**
 * AITellsDetector.js
 * ------------------
 * Structural AI-tell detection for Korean web novels — pure rule-based (no LLM).
 *
 * Inspired by InkOS ai-tells.ts (AGPL v3) — independently implemented for Korean.
 *
 * 4 detection dimensions:
 *   1. AI 특유 표현 밀도 (한편, 그러나, 이에 따라...)
 *   2. 단락 길이 균일성 (변동계수 < 0.15)
 *   3. 공식화 전환어 반복 (동일 전환어 3+회)
 *   4. 목록식 구조 (같은 접두어 문장 연속 3+)
 *
 * Returns issues compatible with ContinuityAuditor AuditIssue format.
 */

/**
 * @typedef {Object} AITellIssue
 * @property {'warning'|'info'} severity
 * @property {string} category
 * @property {string} description
 * @property {string} suggestion
 */

// Korean AI-tell markers (expanded from ContinuityAuditor dim 17)
const AI_MARKERS_KO = [
  '한편', '그러나 한편으로는', '이에 따라', '그리하여',
  '물론', '사실상', '결론적으로', '이러한 관점에서', '다양한 측면에서',
  '한 가지 흥미로운 점은', '주목할 만한 것은', '더 나아가',
  '그럼에도 불구하고', '이와 동시에', '한편으로는',
  '부인할 수 없는', '특히 주목할 만한', '이를 통해',
  '결과적으로', '궁극적으로', '본질적으로', '근본적으로',
  '흥미롭게도', '주목할 점은', '중요한 것은',
  '명백하게', '분명히', '확실히',
  '그야말로', '어찌 보면', '다름 아닌',
];

// Hedge words (tentative language)
const HEDGE_KO = [
  '아마도', '어쩌면', '혹시', '그럴 수도', '일종의',
  '어느 정도', '나름대로', '다소', '약간',
];

// Formulaic transitions
const TRANSITIONS_KO = [
  '그러나', '하지만', '그런데', '한편', '반면',
  '게다가', '더불어', '뿐만 아니라', '이와 함께',
  '그럼에도', '그렇지만', '다만',
];

/**
 * Analyze Korean text for AI-tell patterns.
 * @param {string} content
 * @returns {{ issues: AITellIssue[], score: number }}
 */
function analyzeAITells(content) {
  if (!content || content.length < 200) {
    return { issues: [], score: 0 };
  }

  const issues = [];
  let totalPenalty = 0;

  // ─── 1. AI marker density ───
  let markerCount = 0;
  const markerHits = [];
  for (const marker of AI_MARKERS_KO) {
    const regex = new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = content.match(regex);
    if (matches) {
      markerCount += matches.length;
      if (matches.length >= 2) markerHits.push(`"${marker}"x${matches.length}`);
    }
  }
  const markerDensity = markerCount / (content.length / 1000);
  if (markerDensity > 3) {
    totalPenalty += 2;
    issues.push({
      severity: 'warning',
      category: 'AI 문체 감지',
      description: `AI 특유 표현 밀도 ${markerDensity.toFixed(1)}/1000자 (임계치 >3). ${markerHits.slice(0, 5).join(', ')}`,
      suggestion: '설명체 표현을 캐릭터 행동/대사/감각 묘사로 교체하세요. "한편" → 장면 전환으로, "결론적으로" → 삭제.',
    });
  } else if (markerDensity > 2) {
    totalPenalty += 1;
    issues.push({
      severity: 'info',
      category: 'AI 문체 감지',
      description: `AI 특유 표현 밀도 ${markerDensity.toFixed(1)}/1000자 — 주의 수준`,
      suggestion: '과도한 설명체 줄이기. 소설 문체에선 "이에 따라"보다 행동 묘사가 자연스럽습니다.',
    });
  }

  // ─── 2. Paragraph length uniformity ───
  const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
  if (paragraphs.length >= 3) {
    const lengths = paragraphs.map(p => p.length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    if (mean > 0) {
      const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv < 0.15) {
        totalPenalty += 1;
        issues.push({
          severity: 'warning',
          category: '단락 균일성',
          description: `단락 길이 변동계수 ${cv.toFixed(3)} (임계치 <0.15) — 모든 단락이 비슷한 길이로 AI 생성 패턴`,
          suggestion: '짧은 단락(긴장감)과 긴 단락(몰입 묘사)을 의도적으로 섞으세요.',
        });
      }
    }
  }

  // ─── 3. Hedge word density ───
  let hedgeCount = 0;
  for (const word of HEDGE_KO) {
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = content.match(regex);
    if (matches) hedgeCount += matches.length;
  }
  const hedgeDensity = hedgeCount / (content.length / 1000);
  if (hedgeDensity > 3) {
    totalPenalty += 1;
    issues.push({
      severity: 'warning',
      category: '회피 표현 밀도',
      description: `회피 표현(아마도/어쩌면/다소) 밀도 ${hedgeDensity.toFixed(1)}/1000자 — 확신 없는 서술`,
      suggestion: '모호한 표현 대신 확정적 서술. "아마도 슬펐다" → "가슴이 쓰렸다".',
    });
  }

  // ─── 4. Formulaic transition repetition ───
  const transitionHits = {};
  for (const word of TRANSITIONS_KO) {
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = content.match(regex);
    if (matches && matches.length >= 3) {
      transitionHits[word] = matches.length;
    }
  }
  const repeated = Object.entries(transitionHits);
  if (repeated.length > 0) {
    totalPenalty += 1;
    issues.push({
      severity: 'warning',
      category: '공식 전환어 반복',
      description: `전환어 반복: ${repeated.map(([w, c]) => `"${w}"x${c}`).join(', ')}`,
      suggestion: '장면 전환을 행동/시간/시점 전환으로 대체. 동일 전환어 3회 이상 금지.',
    });
  }

  // ─── 5. List-like sentence structure ───
  // Korean uses . ! ? (same as English), NOT Chinese 。！？
  const sentences = content.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 5);
  if (sentences.length >= 3) {
    let maxConsecutive = 1;
    let current = 1;
    for (let i = 1; i < sentences.length; i++) {
      const prev2 = sentences[i - 1].slice(0, 2);
      const curr2 = sentences[i].slice(0, 2);
      if (prev2 === curr2) {
        current++;
        maxConsecutive = Math.max(maxConsecutive, current);
      } else {
        current = 1;
      }
    }
    if (maxConsecutive >= 4) {
      totalPenalty += 1;
      issues.push({
        severity: 'warning',
        category: '목록식 구조',
        description: `동일 접두어 문장 ${maxConsecutive}개 연속 — 목록식 AI 생성 패턴`,
        suggestion: '문장 시작을 다양화. 주어/시간/행동/감각을 번갈아 사용.',
      });
    } else if (maxConsecutive >= 3) {
      issues.push({
        severity: 'info',
        category: '목록식 구조',
        description: `동일 접두어 문장 ${maxConsecutive}개 연속 — 주의 수준`,
        suggestion: '문장 시작 패턴을 의식적으로 변화시키세요.',
      });
    }
  }

  // score: 0 = clean, higher = more AI-like
  return { issues, score: totalPenalty };
}

/**
 * Quick check: is content likely AI-generated? (threshold-based)
 */
function isLikelyAIGenerated(content) {
  const { score } = analyzeAITells(content);
  return score >= 4;
}

module.exports = { analyzeAITells, isLikelyAIGenerated, AI_MARKERS_KO, HEDGE_KO, TRANSITIONS_KO };
