/**
 * ContextComposer — InkOS P11 흡수
 *
 * 4계층 RuleStack 기반 컨텍스트 선별.
 * flat 주입 대신, 각 컨텍스트 소스에 우선순위(precedence)를 부여하고
 * 토큰 예산 내에서 가장 중요한 것부터 주입.
 *
 * 계층:
 *   L1 hard_facts   (precedence 100) — TruthFiles, 캐릭터시트, 세계관
 *   L2 author_intent (precedence 80) — 시놉시스, 장르 프로필, 복선 의무
 *   L3 planning      (precedence 60) — 아웃라인, 챕터플랜, RL 피드백
 *   L4 current_task   (precedence 70) — 피로도, 스타일참조, 상태추적
 *
 * 기존 StoryOrchestrator.getContext 와 호환:
 *   compose() → string (프롬프트에 바로 주입 가능)
 */

const RULE_LAYERS = [
  { id: 'L1', name: 'hard_facts',    precedence: 100, scope: 'global' },
  { id: 'L2', name: 'author_intent', precedence: 80,  scope: 'book' },
  { id: 'L4', name: 'current_task',  precedence: 70,  scope: 'local' },
  { id: 'L3', name: 'planning',      precedence: 60,  scope: 'arc' },
];

/**
 * @typedef {Object} ContextEntry
 * @property {string} source   - 출처 (e.g. "truth/character_sheet", "cgb/style")
 * @property {string} layer    - L1 | L2 | L3 | L4
 * @property {string} reason   - 왜 이 컨텍스트가 필요한지
 * @property {string} content  - 실제 텍스트
 * @property {number} charLen  - content 길이
 */

class ContextComposer {
  /**
   * @param {object} opts
   * @param {number} [opts.budgetChars=12000] - 최대 컨텍스트 문자 수 (~3000 토큰)
   */
  constructor(opts = {}) {
    this.budgetChars = opts.budgetChars || 12000;
    /** @type {ContextEntry[]} */
    this.entries = [];
    /** @type {string[]} */
    this.trace = [];
  }

  // ─── L1: Hard Facts ───

  addTruthFiles(truthFiles, maxChars = 3000) {
    const { TruthManager } = require('./truth/TruthManager');
    const content = TruthManager.formatForPrompt(truthFiles, maxChars);
    if (content) {
      this._add('L1', 'truth/files', 'Preserve canon facts (character, world, timeline, rules)', content);
    }
  }

  addCharacterSheet(characterSheet) {
    if (characterSheet) {
      this._add('L1', 'truth/character_sheet', 'Character names and traits — MUST use exactly', `## Character Sheet (MUST USE)\n${characterSheet}`);
    }
  }

  addWorldSetting(worldSetting) {
    if (worldSetting) {
      this._add('L1', 'truth/world_setting', 'World rules and setting constraints', `## World Setting\n${worldSetting}`);
    }
  }

  // ─── L2: Author Intent ───

  addSynopsis(synopsis) {
    if (synopsis) {
      this._add('L2', 'series/synopsis', 'Series premise and direction', synopsis);
    }
  }

  addHookAgenda(hookAgendaPrompt) {
    if (hookAgendaPrompt) {
      this._add('L2', 'hooks/agenda', 'Narrative debt — must advance or resolve these hooks', hookAgendaPrompt);
    }
  }

  addPacingRule(pacingRule) {
    if (pacingRule) {
      this._add('L2', 'genre/pacing', 'Genre-specific pacing constraint', `\n## 페이싱 규칙\n${pacingRule}`);
    }
  }

  // ─── L3: Planning ───

  addOutline(outlineText) {
    if (outlineText) {
      // Truncate outline to avoid blowing budget
      const truncated = outlineText.length > 2000 ? outlineText.slice(0, 2000) + '\n...(truncated)' : outlineText;
      this._add('L3', 'pipeline/outline', 'Episode outline for reference', truncated);
    }
  }

  addRLFeedback(evalHistory) {
    if (!evalHistory) return;
    const parts = [];
    if (evalHistory.goodPatterns?.length > 0) {
      parts.push('✅ 잘한 점 (유지하세요):');
      for (const p of evalHistory.goodPatterns.slice(0, 3)) parts.push(`  - ${p}`);
    }
    if (evalHistory.antiPatterns?.length > 0) {
      parts.push('⛔ 피해야 할 점:');
      for (const p of evalHistory.antiPatterns.slice(0, 3)) parts.push(`  - ${p}`);
    }
    if (parts.length > 0) {
      this._add('L3', 'rl/eval_history', 'Lessons from previous episode evaluations', '## RL 피드백\n' + parts.join('\n'));
    }
  }

  addPreviousEpisodes(episodes) {
    if (!episodes || episodes.length === 0) return;
    const recent = episodes.slice(-3);
    const parts = ['## Previous Episodes (Long-Term Memory)'];
    for (const ep of recent) {
      parts.push(`Episode ${ep.episode_number}: "${ep.title}" — ${(ep.script_content || '').slice(0, 300)}...`);
    }
    this._add('L3', 'episodes/history', 'Recent episode summaries for continuity', parts.join('\n'));
  }

  // ─── L4: Current Task ───

  addStateTracker(stateSummary) {
    if (stateSummary) {
      this._add('L4', 'score/state', 'Current character states and emotional arcs (SCORE paper)', stateSummary);
    }
  }

  addFatigue(fatiguePrompt) {
    if (fatiguePrompt) {
      this._add('L4', 'fatigue/warnings', 'Long-span fatigue warnings — vary pattern', fatiguePrompt);
    }
  }

  addStyleReferences(styleRefs, genre) {
    if (!styleRefs || styleRefs.length === 0) return;
    const parts = [`\n## Writing Style References (${genre} genre, from ingested novels)`, 'Use these as STYLE REFERENCE — mimic this quality of prose:'];
    for (const ref of styleRefs.slice(0, 3)) {
      parts.push(`\n### ${ref.title}\n${(ref.description || '').slice(0, 500)}`);
    }
    this._add('L4', 'cgb/style', 'Genre-matched style references from ingested novels', parts.join('\n'));
  }

  // ─── Recent Trail (반복 방지) — InkOS Composer 핵심 ───

  addRecentTrail(previousEpisodes) {
    if (!previousEpisodes || previousEpisodes.length < 2) return;
    const recent = previousEpisodes.slice(-5);

    // 제목 반복 방지
    const titles = recent.map(ep => `ep${ep.episode_number}: "${ep.title}"`).join(' | ');
    this._add('L4', 'trail/titles', 'Avoid repeating recent chapter titles', `## Recent Titles (DO NOT repeat)\n${titles}`);

    // 엔딩 반복 방지
    const endings = recent
      .filter(ep => ep.script_content)
      .map(ep => {
        const lines = (ep.script_content || '').split('\n').filter(l => l.trim().length > 5);
        const last = lines[lines.length - 1];
        return last ? `ep${ep.episode_number}: ${last.length > 60 ? last.slice(0, 57) + '...' : last}` : null;
      })
      .filter(Boolean);

    if (endings.length >= 2) {
      this._add('L4', 'trail/endings', 'Avoid structural repetition in chapter endings', `## Recent Endings (vary your ending pattern)\n${endings.join('\n')}`);
    }
  }

  // ─── Compose ───

  /**
   * 우선순위 기반으로 컨텍스트를 선별하여 하나의 문자열로 반환.
   * 예산 초과 시 낮은 우선순위부터 잘림.
   *
   * @returns {{ prompt: string, trace: string[], usedChars: number, droppedCount: number }}
   */
  compose() {
    // precedence 순으로 정렬 (높을수록 먼저)
    const layerPrecedence = {};
    for (const l of RULE_LAYERS) layerPrecedence[l.id] = l.precedence;

    const sorted = [...this.entries].sort((a, b) => {
      const pa = layerPrecedence[a.layer] || 0;
      const pb = layerPrecedence[b.layer] || 0;
      return pb - pa; // 높은 precedence 먼저
    });

    const selected = [];
    let usedChars = 0;
    let droppedCount = 0;

    for (const entry of sorted) {
      if (usedChars + entry.charLen <= this.budgetChars) {
        selected.push(entry);
        usedChars += entry.charLen;
        this.trace.push(`[✓ ${entry.layer}] ${entry.source} (${entry.charLen}c) — ${entry.reason}`);
      } else {
        droppedCount++;
        this.trace.push(`[✗ ${entry.layer}] ${entry.source} (${entry.charLen}c) — DROPPED (budget exceeded)`);
      }
    }

    // 출력 순서: L1 → L2 → L4 → L3 (읽기 좋은 순서)
    const layerOrder = { L1: 0, L2: 1, L4: 2, L3: 3 };
    selected.sort((a, b) => (layerOrder[a.layer] || 9) - (layerOrder[b.layer] || 9));

    const prompt = selected.map(e => e.content).join('\n\n');
    return { prompt, trace: this.trace, usedChars, droppedCount };
  }

  // ─── Internal ───

  _add(layer, source, reason, content) {
    if (!content || content.trim().length === 0) return;
    this.entries.push({
      source,
      layer,
      reason,
      content: content.trim(),
      charLen: content.trim().length,
    });
  }
}

module.exports = { ContextComposer, RULE_LAYERS };
