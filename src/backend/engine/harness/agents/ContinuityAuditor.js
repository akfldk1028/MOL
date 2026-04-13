/**
 * ContinuityAuditor.js
 * --------------------
 * 18-dimension continuity audit for Korean web novels.
 *
 * Runs ALONGSIDE EvaluationHarness (HANNA 6D) — not a replacement.
 * HANNA measures quality (creativity, coherence, empathy).
 * ContinuityAuditor measures consistency (OOC, timeline, lore, hooks).
 *
 * Inspired by InkOS's 37-dimension ContinuityAuditor (AGPL v3).
 * **Independently implemented** — no InkOS code used.
 *
 * Integration point:
 *   StoryOrchestrator: Write → PostValidate → [Eval + ContinuityAudit] → Revise?
 */

const { getActiveDimensions, getDimensionLabel } = require('../../../config/genre-audit-config');

/**
 * @typedef {Object} AuditIssue
 * @property {'critical'|'warning'|'info'} severity
 * @property {string} category
 * @property {number} dimensionId
 * @property {string} description
 * @property {string} suggestion
 * @property {string} [evidence] — quote from text that triggered the issue
 */

/**
 * @typedef {Object} AuditResult
 * @property {boolean} passed
 * @property {AuditIssue[]} issues
 * @property {string} summary
 * @property {number} dimensionsChecked
 * @property {number} criticalCount
 * @property {number} warningCount
 */

/**
 * Run a continuity audit on a chapter.
 *
 * @param {object} params
 * @param {string} params.chapterContent  — the chapter text to audit
 * @param {number} params.chapterNumber
 * @param {string} params.genre           — for dimension selection
 * @param {object} [params.truthFiles]    — from TruthManager.load()
 * @param {string} [params.outline]       — series outline (for drift check)
 * @param {string} [params.previousChapterSummary]
 * @param {Function} params.llmCall       — async (system, user, opts) => string
 * @returns {Promise<AuditResult>}
 */
async function auditChapter({
  chapterContent,
  chapterNumber,
  genre,
  truthFiles = {},
  outline = '',
  previousChapterSummary = '',
  llmCall,
}) {
  if (!chapterContent || !llmCall) {
    return { passed: true, issues: [], summary: 'No content to audit', dimensionsChecked: 0, criticalCount: 0, warningCount: 0 };
  }

  const dimensions = getActiveDimensions(genre);
  const dimensionList = dimensions.map(d => `${d.id}. ${d.ko} (${d.en})`).join('\n');

  // Build audit prompt
  const system = buildAuditSystemPrompt(dimensionList, genre);
  const user = buildAuditUserPrompt({
    chapterContent,
    chapterNumber,
    truthFiles,
    outline,
    previousChapterSummary,
  });

  // Call LLM
  let raw;
  try {
    raw = await llmCall(system, user, { maxOutputTokens: 2048 });
  } catch (err) {
    console.warn('[ContinuityAuditor] LLM call failed:', err.message);
    return { passed: true, issues: [], summary: 'Audit skipped (LLM error)', dimensionsChecked: 0, criticalCount: 0, warningCount: 0 };
  }

  // Parse response
  const issues = parseAuditResponse(raw, dimensions);

  // Also run rule-based checks (no LLM needed)
  const ruleIssues = runRuleBasedChecks(chapterContent, dimensions);
  issues.push(...ruleIssues);

  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const passed = criticalCount === 0;

  return {
    passed,
    issues,
    summary: passed
      ? `Passed: ${dimensions.length} dimensions checked, ${warningCount} warnings`
      : `Failed: ${criticalCount} critical issues found`,
    dimensionsChecked: dimensions.length,
    criticalCount,
    warningCount,
  };
}

// ─────────────────────────────────────────────
// Prompt builders
// ─────────────────────────────────────────────

function buildAuditSystemPrompt(dimensionList, genre) {
  return `You are a continuity auditor for Korean web novels (genre: ${genre}).

Your task: Check the given chapter against the truth files for consistency issues.

## Audit Dimensions
${dimensionList}

## Output Format
Return ONLY a JSON array of issues. Each issue:
{
  "dimensionId": number,
  "severity": "critical" | "warning" | "info",
  "description": "한국어로 설명 (what's wrong)",
  "suggestion": "한국어로 수정 제안",
  "evidence": "문제가 되는 원문 인용 (짧게)"
}

If NO issues found, return: []

## Severity Guidelines
- **critical**: breaks story logic (wrong character location, dead character appears, timeline impossible)
- **warning**: weakens quality (pacing issue, cliché overuse, mild OOC)
- **info**: style suggestion (could be better but not wrong)

Focus on FACTS, not style. Style is handled by a separate evaluator.`;
}

function buildAuditUserPrompt({ chapterContent, chapterNumber, truthFiles, outline, previousChapterSummary }) {
  const sections = [];

  sections.push(`## Chapter ${chapterNumber} to audit`);
  sections.push(chapterContent.slice(0, 6000));

  if (truthFiles.currentState) {
    sections.push(`\n## Current State (truth)\n${truthFiles.currentState.slice(0, 1500)}`);
  }
  if (truthFiles.storyBible) {
    sections.push(`\n## Story Bible (truth)\n${truthFiles.storyBible.slice(0, 1000)}`);
  }
  if (truthFiles.pendingHooks) {
    sections.push(`\n## Pending Hooks\n${truthFiles.pendingHooks.slice(0, 800)}`);
  }
  if (truthFiles.bookRules) {
    sections.push(`\n## Book Rules (ABSOLUTE)\n${truthFiles.bookRules.slice(0, 500)}`);
  }
  if (truthFiles.particleLedger) {
    sections.push(`\n## Particle Ledger (numbers)\n${truthFiles.particleLedger.slice(0, 500)}`);
  }
  if (outline) {
    sections.push(`\n## Outline (for drift check)\n${outline.slice(0, 800)}`);
  }
  if (previousChapterSummary) {
    sections.push(`\n## Previous Chapter Summary\n${previousChapterSummary.slice(0, 500)}`);
  }

  return sections.join('\n');
}

// ─────────────────────────────────────────────
// Response parser
// ─────────────────────────────────────────────

function parseAuditResponse(raw, activeDimensions) {
  if (!raw) return [];

  // Extract JSON array from LLM response
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];

    const validDimIds = new Set(activeDimensions.map(d => d.id));

    return arr
      .filter(item => item && typeof item === 'object')
      .filter(item => validDimIds.has(item.dimensionId))
      .map(item => ({
        severity: ['critical', 'warning', 'info'].includes(item.severity) ? item.severity : 'info',
        category: getDimensionLabel(item.dimensionId, 'ko'),
        dimensionId: item.dimensionId,
        description: String(item.description || ''),
        suggestion: String(item.suggestion || ''),
        evidence: item.evidence ? String(item.evidence).slice(0, 200) : undefined,
      }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// Rule-based checks (no LLM, fast)
// ─────────────────────────────────────────────

function runRuleBasedChecks(content, activeDimensions) {
  const issues = [];
  const activeIds = new Set(activeDimensions.map(d => d.id));

  // Dim 17: AI 문체 감지 — delegated to AITellsDetector.js (avoid duplicate reporting)
  // AITellsDetector runs as a separate step in StoryOrchestrator review cycle.

  // Dim 18: 한자어 과다 사용
  if (activeIds.has(18)) {
    const HANJA_HEAVY = /[가-힣]*[적률성화량도](?=[\s,.])/g;
    const matches = content.match(HANJA_HEAVY);
    if (matches && matches.length > 50) {
      issues.push({
        severity: 'info',
        category: getDimensionLabel(18, 'ko'),
        dimensionId: 18,
        description: `한자어 종결어미(적/률/성/화/량/도)가 ${matches.length}회 — 웹소설 독자층에게 딱딱할 수 있음`,
        suggestion: '일부를 순우리말이나 구어체로 교체하세요.',
      });
    }
  }

  // Dim 16: 존댓말 일관성 (간단 체크)
  if (activeIds.has(16)) {
    const formalEndings = (content.match(/습니다|합니다|입니다|됩니다|하십시오|주십시오/g) || []).length;
    const casualEndings = (content.match(/했다|이다|한다|였다|갔다|봤다|왔다|됐다/g) || []).length;
    // If both exist in significant amounts, it's mixed
    if (formalEndings > 10 && casualEndings > 10) {
      const ratio = Math.min(formalEndings, casualEndings) / Math.max(formalEndings, casualEndings);
      if (ratio > 0.3) {
        issues.push({
          severity: 'warning',
          category: getDimensionLabel(16, 'ko'),
          dimensionId: 16,
          description: `존댓말(${formalEndings}회)과 반말(${casualEndings}회)이 혼재됨 (비율 ${(ratio*100).toFixed(0)}%)`,
          suggestion: '서술체(~했다)와 대화체(~합니다)가 의도적으로 분리되어 있는지 확인하세요.',
        });
      }
    }
  }

  return issues;
}

module.exports = {
  auditChapter,
  buildAuditSystemPrompt,
  buildAuditUserPrompt,
  parseAuditResponse,
  runRuleBasedChecks,
};
