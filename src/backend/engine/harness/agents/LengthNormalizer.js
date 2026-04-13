/**
 * LengthNormalizer.js
 * -------------------
 * Normalizes chapter length to fit within genre-specific soft/hard range.
 * Uses LLM to expand or compress text while preserving facts and hooks.
 *
 * Inspired by InkOS LengthNormalizerAgent (AGPL v3) — independently implemented.
 */

const { countKoreanWords, getNormalizeMode, isOutsideHardRange } = require('../../../config/length-governance');

/**
 * @typedef {import('../../../config/length-governance').LengthSpec} LengthSpec
 */

/**
 * Normalize chapter content to fit within the spec.
 * @param {object} params
 * @param {string} params.content
 * @param {LengthSpec} params.lengthSpec
 * @param {Function} params.llmCall - async (system, user, opts) => string
 * @param {string} [params.chapterIntent] - what the chapter is about (for context)
 * @returns {Promise<{ content: string, wordCount: number, applied: boolean, mode: string, warning?: string }>}
 */
async function normalizeLength({ content, lengthSpec, llmCall, chapterIntent }) {
  const wordCount = countKoreanWords(content);
  const mode = getNormalizeMode(wordCount, lengthSpec);

  if (mode === 'none') {
    return { content, wordCount, applied: false, mode: 'none' };
  }

  const system = buildNormalizerSystem(mode);
  const user = buildNormalizerUser(content, lengthSpec, wordCount, mode, chapterIntent);

  let normalized;
  try {
    normalized = await llmCall(system, user, { maxOutputTokens: Math.max(4096, Math.ceil(wordCount * 1.3)) });
  } catch (err) {
    console.warn('[LengthNormalizer] LLM call failed:', err.message);
    return { content, wordCount, applied: false, mode, warning: `LLM error: ${err.message}` };
  }

  // Sanitize: strip LLM wrapper text
  const cleaned = sanitizeOutput(normalized, content);
  const finalCount = countKoreanWords(cleaned);

  let warning;
  if (isOutsideHardRange(finalCount, lengthSpec)) {
    warning = `정규화 후에도 hard range 밖: ${finalCount}단어 (범위 ${lengthSpec.hardMin}-${lengthSpec.hardMax})`;
  }

  return { content: cleaned, wordCount: finalCount, applied: true, mode, warning };
}

function buildNormalizerSystem(mode) {
  const action = mode === 'compress' ? '압축' : '확장';
  return `당신은 한국어 웹소설 챕터 길이 조정기입니다.

## 임무
챕터 본문을 ${action}하여 목표 분량에 맞추세요.

## 규칙
- 한 번만 수정. 재귀적 재작성 금지.
- 모든 사실, 캐릭터명, 장소명, 복선을 보존.
- 새로운 서브플롯이나 캐릭터를 추가하지 마세요.
- 설명이나 분석을 본문에 섞지 마세요.
- 수정된 완성 본문만 출력. 설명 텍스트 금지.
- 반드시 100% 한국어로 작성.`;
}

function buildNormalizerUser(content, spec, currentCount, mode, intent) {
  const parts = [
    `## 현재 분량: ${currentCount}단어`,
    `## 목표 범위: ${spec.softMin}~${spec.softMax}단어 (목표: ${spec.target})`,
    `## 작업: ${mode === 'compress' ? '압축 (불필요한 반복/설명 제거)' : '확장 (감각 묘사/내면 독백/대화 추가)'}`,
  ];

  if (intent) {
    parts.push(`\n## 챕터 의도\n${intent}`);
  }

  if (mode === 'compress') {
    parts.push(`\n## 압축 지침
- 반복적인 묘사/설명 통합
- 불필요한 부사/형용사 제거
- 요약적 서술 → 핵심 행동만 남기기
- 단, 대화와 감정 장면은 유지`);
  } else {
    parts.push(`\n## 확장 지침
- 감각 묘사 추가 (시각, 청각, 촉각, 후각)
- 캐릭터 내면 독백 삽입
- 대화 확장 (서브텍스트 포함)
- 장면 전환부에 배경 묘사 추가
- 단, 새로운 사건을 만들지 말것`);
  }

  parts.push(`\n## 본문\n${content}`);
  return parts.join('\n');
}

/**
 * Strip common LLM wrapper text from output.
 */
function sanitizeOutput(raw, fallback) {
  if (!raw || !raw.trim()) return fallback;
  let text = raw.trim();

  // Strip fenced code blocks
  const fenced = text.match(/```(?:[\w-]+)?\s*\n([\s\S]*?)\n```/);
  if (fenced && fenced[1]?.trim()) return fenced[1].trim();

  // Strip common Korean/English wrapper lines
  const wrapperPatterns = [
    /^(?:아래는|다음은|수정된|확장된|압축된|아래에)[^.。]*(?:본문|결과|내용|버전|텍스트|입니다|있습니다)[^.。]*[.。]?\s*$/im,
    /^(?:here(?:'s| is)|below is).*(chapter|draft|content|revised).*$/im,
    /^#+\s*(?:수정|결과|출력|본문|설명).*$/im,
  ];

  const lines = text.split('\n');
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true; // keep blank lines
    return !wrapperPatterns.some(p => p.test(trimmed));
  });

  const result = filtered.join('\n').trim();
  if (!result) return fallback;
  // If stripping removed >80% of content AND more than 2 lines were removed, too aggressive
  const removedLines = lines.length - filtered.length;
  if (result.length < text.length * 0.2 && removedLines > 2) return text;
  return result;
}

module.exports = { normalizeLength, sanitizeOutput };
