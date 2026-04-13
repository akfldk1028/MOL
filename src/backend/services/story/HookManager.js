/**
 * HookManager.js
 * --------------
 * Plot hook lifecycle management for serial novels.
 *
 * Each hook has a payoff timing (immediate→endgame) and tracks:
 *   - age: chapters since creation
 *   - dormancy: chapters since last mention
 *   - pressure: urgency to advance or resolve
 *
 * Integrates with TruthManager pendingHooks (stored as structured JSON in CGB).
 */

// ─── Timing profiles (from InkOS hook-policy) ───

const TIMING_PROFILES = {
  immediate:  { earliestResolve: 1, staleDormancy: 1,  overdueAge: 3,  minimumPhase: 'opening', resolveBias: 5 },
  'near-term':{ earliestResolve: 1, staleDormancy: 2,  overdueAge: 5,  minimumPhase: 'opening', resolveBias: 4 },
  'mid-arc':  { earliestResolve: 2, staleDormancy: 4,  overdueAge: 8,  minimumPhase: 'opening', resolveBias: 3 },
  'slow-burn':{ earliestResolve: 4, staleDormancy: 5,  overdueAge: 12, minimumPhase: 'middle',  resolveBias: 2 },
  endgame:    { earliestResolve: 6, staleDormancy: 6,  overdueAge: 16, minimumPhase: 'late',    resolveBias: 1 },
};

const PHASE_WEIGHT = { opening: 0, middle: 1, late: 2 };
const PHASE_THRESHOLDS = { middleChapter: 8, lateChapter: 24 };
const MAX_ACTIVE_HOOKS = 12;

/**
 * @typedef {Object} Hook
 * @property {string} id
 * @property {string} text - description of the hook
 * @property {'immediate'|'near-term'|'mid-arc'|'slow-burn'|'endgame'} timing
 * @property {number} startChapter
 * @property {number} lastAdvanced - last chapter where hook was mentioned/progressed
 * @property {'open'|'progressing'|'resolved'|'abandoned'} status
 */

/**
 * @typedef {Object} HookAnalysis
 * @property {boolean} stale
 * @property {boolean} overdue
 * @property {boolean} readyToResolve
 * @property {number} advancePressure
 * @property {number} resolvePressure
 * @property {number} age
 * @property {number} dormancy
 */

/**
 * Analyze a single hook's lifecycle state.
 * @param {Hook} hook
 * @param {number} currentChapter
 * @param {number} [totalChapters] - estimated total chapters (for phase calc)
 * @returns {HookAnalysis}
 */
function analyzeHook(hook, currentChapter, totalChapters) {
  const profile = TIMING_PROFILES[hook.timing] || TIMING_PROFILES['mid-arc'];
  const phase = resolvePhase(currentChapter, totalChapters);
  const age = Math.max(0, currentChapter - hook.startChapter);
  const dormancy = Math.max(0, currentChapter - Math.max(hook.startChapter, hook.lastAdvanced));

  const phaseReady = PHASE_WEIGHT[phase] >= PHASE_WEIGHT[profile.minimumPhase];
  const overdue = phaseReady && age >= profile.overdueAge;
  const stale = phaseReady && dormancy >= profile.staleDormancy;
  const isProgressing = hook.status === 'progressing';
  const readyToResolve = phaseReady && age >= profile.earliestResolve && (overdue || isProgressing);

  const advancePressure = age + dormancy + (stale ? 8 : 0) + (overdue ? 6 : 0);
  const resolvePressure = readyToResolve
    ? profile.resolveBias * 10 + (isProgressing ? 5 : 0) + Math.min(12, dormancy * 2) + (overdue ? 10 : 0)
    : 0;

  return { stale, overdue, readyToResolve, advancePressure, resolvePressure, age, dormancy };
}

/**
 * Get the agenda for the next chapter: which hooks to advance/resolve.
 * @param {Hook[]} hooks - all active hooks
 * @param {number} currentChapter
 * @param {number} [totalChapters]
 * @returns {{ mustAdvance: Hook[], shouldResolve: Hook[], staleWarnings: Hook[], healthWarning?: string }}
 */
function getAgenda(hooks, currentChapter, totalChapters) {
  const active = hooks.filter(h => h.status === 'open' || h.status === 'progressing');

  const analyzed = active.map(h => ({
    hook: h,
    analysis: analyzeHook(h, currentChapter, totalChapters),
  }));

  // Health check
  let healthWarning;
  if (active.length > MAX_ACTIVE_HOOKS) {
    healthWarning = `활성 복선 ${active.length}개 (한도 ${MAX_ACTIVE_HOOKS}) — 일부를 회수하거나 포기하세요.`;
  }

  // Sort by pressure
  const mustAdvance = analyzed
    .filter(a => a.analysis.advancePressure >= 8)
    .sort((a, b) => b.analysis.advancePressure - a.analysis.advancePressure)
    .slice(0, 3)
    .map(a => a.hook);

  const shouldResolve = analyzed
    .filter(a => a.analysis.readyToResolve)
    .sort((a, b) => b.analysis.resolvePressure - a.analysis.resolvePressure)
    .slice(0, 2)
    .map(a => a.hook);

  const staleWarnings = analyzed
    .filter(a => a.analysis.stale && !a.analysis.readyToResolve)
    .map(a => a.hook);

  return { mustAdvance, shouldResolve, staleWarnings, healthWarning };
}

/**
 * Format hook agenda for prompt injection.
 * @param {{ mustAdvance, shouldResolve, staleWarnings, healthWarning }} agenda
 * @returns {string}
 */
function formatAgendaForPrompt(agenda) {
  const parts = [];

  if (agenda.healthWarning) {
    parts.push(`## 복선 건강 경고\n${agenda.healthWarning}`);
  }

  if (agenda.shouldResolve.length > 0) {
    parts.push('## 이번 장에서 회수해야 할 복선');
    for (const h of agenda.shouldResolve) {
      parts.push(`- **[회수]** ${h.text} (${h.timing}, ${h.startChapter}장에서 시작)`);
    }
  }

  if (agenda.mustAdvance.length > 0) {
    parts.push('## 이번 장에서 진행해야 할 복선');
    for (const h of agenda.mustAdvance) {
      parts.push(`- **[진행]** ${h.text} (${h.timing}, 방치 ${Math.max(0, h.lastAdvanced)}장 이후)`);
    }
  }

  if (agenda.staleWarnings.length > 0) {
    parts.push('## 방치된 복선 (곧 처리 필요)');
    for (const h of agenda.staleWarnings) {
      parts.push(`- ${h.text} (${h.startChapter}장 시작, 방치 중)`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : '';
}

/**
 * Parse hooks from TruthManager pendingHooks text → structured array.
 * @param {string} pendingHooksText
 * @returns {Hook[]}
 */
function parseHooksFromTruth(pendingHooksText) {
  if (!pendingHooksText) return [];

  // Try JSON first (structured format)
  try {
    const match = pendingHooksText.match(/\[[\s\S]*\]/);
    if (match) {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) return arr.filter(h => h.id && h.text);
    }
  } catch {}

  // Fallback: parse markdown list
  const hooks = [];
  const lines = pendingHooksText.split('\n').filter(l => l.trim().startsWith('-'));
  for (const line of lines) {
    const text = line.replace(/^[-*]\s*/, '').trim();
    if (text && text !== '(none yet)' && text !== '(없음)') {
      hooks.push({
        id: `hook-${hooks.length + 1}`,
        text,
        timing: 'mid-arc',
        startChapter: 1,
        lastAdvanced: 1,
        status: 'open',
      });
    }
  }
  return hooks;
}

function resolvePhase(chapter, total) {
  if (total && total > 0) {
    const progress = chapter / total;
    if (progress >= 0.72) return 'late';
    if (progress >= 0.33) return 'middle';
    return 'opening';
  }
  if (chapter >= PHASE_THRESHOLDS.lateChapter) return 'late';
  if (chapter >= PHASE_THRESHOLDS.middleChapter) return 'middle';
  return 'opening';
}

module.exports = {
  analyzeHook,
  getAgenda,
  formatAgendaForPrompt,
  parseHooksFromTruth,
  TIMING_PROFILES,
  MAX_ACTIVE_HOOKS,
};
