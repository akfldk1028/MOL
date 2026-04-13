/**
 * SpotFixReviser.js
 * -----------------
 * Patch-based chapter revision — fixes only the problematic parts,
 * leaving the rest of the text untouched.
 *
 * Instead of full rewrite (expensive, destroys good parts), uses
 * TARGET_TEXT → REPLACEMENT_TEXT patches.
 *
 * Safety: rejects if patches touch >25% of original text,
 * or if TARGET_TEXT doesn't match exactly once.
 */

const MAX_TOUCHED_RATIO = 0.25;

/**
 * @typedef {{ targetText: string, replacementText: string }} Patch
 * @typedef {{ applied: boolean, content: string, patchCount: number, touchedChars: number, rejected?: string }} PatchResult
 */

/**
 * Run spot-fix revision via LLM.
 * @param {object} params
 * @param {string} params.content - original chapter text
 * @param {Array<{severity:string, category:string, description:string, suggestion:string}>} params.issues
 * @param {Function} params.llmCall - async (system, user, opts) => string
 * @param {string} [params.genre]
 * @returns {Promise<PatchResult>}
 */
async function spotFixRevise({ content, issues, llmCall, genre }) {
  if (!issues || issues.length === 0) {
    return { applied: false, content, patchCount: 0, touchedChars: 0 };
  }

  const system = buildSpotFixSystem(genre);
  const user = buildSpotFixUser(content, issues);

  let raw;
  try {
    raw = await llmCall(system, user, { maxOutputTokens: 4096 });
  } catch (err) {
    console.warn('[SpotFixReviser] LLM call failed:', err.message);
    return { applied: false, content, patchCount: 0, touchedChars: 0, rejected: `LLM error: ${err.message}` };
  }

  const patches = parsePatches(raw);
  return applyPatches(content, patches);
}

function buildSpotFixSystem(genre) {
  return `당신은 한국어 ${genre || ''} 웹소설 수정 편집자입니다.

## 임무
감사 의견에서 지적된 **문제 부분만** 정확히 수정하세요.

## 규칙
- 문제가 된 문장/단락만 수정. 나머지는 절대 건드리지 마세요.
- 캐릭터명, 장소명, 사실관계를 변경하지 마세요.
- 새로운 서브플롯이나 캐릭터를 추가하지 마세요.
- 수정 범위: 문제 문장 ± 앞뒤 1문장까지만.

## 출력 형식
반드시 아래 형식으로만 출력하세요. 설명 텍스트 금지.

--- PATCH 1 ---
TARGET_TEXT:
(원문에서 정확히 복사한 문제 부분)
REPLACEMENT_TEXT:
(수정된 텍스트)
--- END PATCH ---

여러 문제가 있으면 PATCH를 반복하세요.
수정할 수 없는 문제는 무시하세요.`;
}

function buildSpotFixUser(content, issues) {
  const issueList = issues
    .map((i, idx) => `${idx + 1}. [${i.severity}] ${i.category}: ${i.description}\n   제안: ${i.suggestion}`)
    .join('\n');

  return `## 감사 의견
${issueList}

## 원문
${content}`;
}

/**
 * Parse PATCH blocks from LLM response.
 * @param {string} raw
 * @returns {Patch[]}
 */
function parsePatches(raw) {
  if (!raw) return [];

  const patches = [];
  const regex = /--- PATCH(?:\s+\d+)? ---\s*TARGET_TEXT:\s*([\s\S]*?)\s*REPLACEMENT_TEXT:\s*([\s\S]*?)\s*--- END PATCH ---/g;

  let match;
  while ((match = regex.exec(raw)) !== null) {
    const targetText = trimField(match[1] || '');
    const replacementText = trimField(match[2] || '');
    if (targetText.length > 0) {
      patches.push({ targetText, replacementText });
    }
  }

  return patches;
}

/**
 * Apply patches to original content with safety checks.
 * @param {string} original
 * @param {Patch[]} patches
 * @returns {PatchResult}
 */
function applyPatches(original, patches) {
  if (patches.length === 0) {
    return { applied: false, content: original, patchCount: 0, touchedChars: 0, rejected: 'No valid patches' };
  }

  // Safety: check total touch ratio
  const touchedChars = patches.reduce((sum, p) => sum + p.targetText.length, 0);
  if (original.length > 0 && touchedChars / original.length > MAX_TOUCHED_RATIO) {
    return {
      applied: false, content: original, patchCount: 0, touchedChars,
      rejected: `Patches touch ${Math.round(touchedChars / original.length * 100)}% of text (max ${MAX_TOUCHED_RATIO * 100}%)`,
    };
  }

  let current = original;
  let appliedCount = 0;

  for (const patch of patches) {
    const start = current.indexOf(patch.targetText);
    if (start === -1) continue; // skip unmatched patches

    // Check unique match
    const another = current.indexOf(patch.targetText, start + patch.targetText.length);
    if (another !== -1) continue; // ambiguous match, skip

    current = current.slice(0, start) + patch.replacementText + current.slice(start + patch.targetText.length);
    appliedCount++;
  }

  return {
    applied: appliedCount > 0,
    content: current,
    patchCount: appliedCount,
    touchedChars,
  };
}

function trimField(value) {
  return value.replace(/^\s*\n/, '').replace(/\n\s*$/, '').trim();
}

module.exports = { spotFixRevise, parsePatches, applyPatches };
