/**
 * TruthManager.js
 * ----------------
 * Manages 6 truth files per series — the structural backbone of a novel's state.
 *
 * Inspired by InkOS (AGPL v3) truth file design, **independently implemented**
 * using CGB graph nodes instead of local markdown files.
 *
 * 6 Truth Files:
 *   1. currentState    — character/location/time state at this chapter
 *   2. storyBible      — world rules, terminology, lore
 *   3. pendingHooks    — unresolved foreshadowing / plot hooks
 *   4. volumeOutline   — full outline (per-volume/arc)
 *   5. bookRules       — author's absolute constraints (character names, banned tropes)
 *   6. particleLedger  — numerical/setting change ledger (power levels, inventory)
 *
 * Storage: CGB graph nodes (type: 'Idea', metadata.truthType: ...)
 * Advantage over InkOS: cloud-based, multi-agent accessible, searchable via pgvector.
 */

const BrainClient = require('../../BrainClient');

const TRUTH_TYPES = [
  'currentState',
  'storyBible',
  'pendingHooks',
  'volumeOutline',
  'bookRules',
  'particleLedger',
];

class TruthManager {
  /**
   * Load all 6 truth files for a series.
   * @param {string} agentId
   * @param {string} seriesId
   * @returns {Promise<Record<string, string|null>>}
   */
  static async load(agentId, seriesId) {
    const result = {};
    for (const tt of TRUTH_TYPES) {
      result[tt] = await this._loadOne(agentId, seriesId, tt);
    }
    return result;
  }

  /**
   * Load a single truth file.
   */
  static async _loadOne(agentId, seriesId, truthType) {
    try {
      const nodeId = `truth-${seriesId.slice(0, 8)}-${truthType}`;
      const bc = await BrainClient.getBrainConfig(agentId);
      if (!bc) return null;

      const result = await BrainClient.searchGraph(agentId, `truth ${truthType} ${seriesId.slice(0, 8)}`);
      // Find exact truth node by metadata
      const node = (result || []).find(n =>
        n.metadata?.truthType === truthType && n.metadata?.seriesId === seriesId
      );
      return node ? node.description : null;
    } catch {
      return null;
    }
  }

  /**
   * Store (create or update) a single truth file.
   * @param {string} agentId
   * @param {string} seriesId
   * @param {string} truthType
   * @param {string} content
   */
  static async store(agentId, seriesId, truthType, content) {
    if (!TRUTH_TYPES.includes(truthType)) {
      throw new Error(`TruthManager.store: invalid truthType '${truthType}'`);
    }
    const nodeId = `truth-${seriesId.slice(0, 8)}-${truthType}`;
    const title = `[truth:${truthType}] ${seriesId.slice(0, 8)}`;

    return BrainClient.addToGraph(agentId, {
      id: nodeId,
      type: 'Idea',
      title,
      description: content,
      metadata: {
        truthType,
        seriesId,
        nodeRole: 'truth_file',
        updatedAt: new Date().toISOString(),
      },
    }, null, { skipSimilarSearch: true });
  }

  /**
   * Update all truth files after a chapter is written.
   * Uses LLM to extract changes from the chapter content.
   * @param {string} agentId
   * @param {string} seriesId
   * @param {string} chapterContent
   * @param {number} chapterNumber
   * @param {object} [options]
   * @param {Function} [options.llmCall] - injectable LLM caller
   */
  static async updateAfterChapter(agentId, seriesId, chapterContent, chapterNumber, options = {}) {
    const llmCall = options.llmCall || this._defaultLLMCall();
    const current = await this.load(agentId, seriesId);

    // 1. Extract state changes from chapter
    const extractPrompt = this._buildExtractionPrompt(current, chapterContent, chapterNumber);
    const raw = await llmCall(extractPrompt.system, extractPrompt.user, { maxOutputTokens: 2048 });

    let updates;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      updates = match ? JSON.parse(match[0]) : {};
    } catch {
      console.warn('[TruthManager] failed to parse LLM extraction, skipping update');
      return;
    }

    // 2. Update each truth file that has changes
    const promises = [];
    for (const tt of TRUTH_TYPES) {
      if (updates[tt] && typeof updates[tt] === 'string' && updates[tt].trim()) {
        // Merge: append new info to existing
        const merged = current[tt]
          ? `${current[tt]}\n\n--- Chapter ${chapterNumber} Update ---\n${updates[tt]}`
          : updates[tt];
        promises.push(this.store(agentId, seriesId, tt, merged));
      }
    }
    await Promise.allSettled(promises);
  }

  /**
   * Initialize truth files for a new series (first episode).
   * @param {string} agentId
   * @param {string} seriesId
   * @param {object} series - { title, genre, synopsis, character_sheet, world_setting }
   * @param {object} [options]
   * @param {Function} [options.llmCall]
   */
  static async initialize(agentId, seriesId, series, options = {}) {
    const llmCall = options.llmCall || this._defaultLLMCall();

    const initPrompt = this._buildInitPrompt(series);
    const raw = await llmCall(initPrompt.system, initPrompt.user, { maxOutputTokens: 4096 });

    let initial;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      initial = match ? JSON.parse(match[0]) : {};
    } catch {
      // Fallback: basic initialization from series metadata
      initial = {
        currentState: `# Current State\n\n## Characters\n${series.character_sheet || 'TBD'}\n\n## Location\nTBD\n\n## Time\nChapter 1`,
        storyBible: `# Story Bible\n\n## World Setting\n${series.world_setting || series.synopsis || 'TBD'}`,
        pendingHooks: '# Pending Hooks\n\n(none yet)',
        volumeOutline: `# Volume Outline\n\n## ${series.title}\nGenre: ${series.genre}\n\n${series.synopsis || ''}`,
        bookRules: `# Book Rules\n\n- Character names must be used exactly as defined\n- Genre: ${series.genre}`,
        particleLedger: '# Particle Ledger\n\n(no tracked items yet)',
      };
    }

    const promises = [];
    for (const tt of TRUTH_TYPES) {
      if (initial[tt]) {
        promises.push(this.store(agentId, seriesId, tt, initial[tt]));
      }
    }
    await Promise.allSettled(promises);
    return initial;
  }

  /**
   * Format truth files for WritingHarness prompt injection.
   * @param {Record<string, string|null>} truthFiles
   * @param {number} [maxChars=3000]
   * @returns {string}
   */
  static formatForPrompt(truthFiles, maxChars = 3000) {
    const sections = [];
    const labels = {
      currentState: 'Current State (characters/locations/time)',
      storyBible: 'Story Bible (world rules & lore)',
      pendingHooks: 'Pending Hooks (unresolved foreshadowing)',
      volumeOutline: 'Volume Outline',
      bookRules: 'Book Rules (ABSOLUTE constraints)',
      particleLedger: 'Particle Ledger (power levels, inventory)',
    };

    for (const [key, label] of Object.entries(labels)) {
      const content = truthFiles[key];
      if (content && content.trim()) {
        sections.push(`### ${label}\n${content.trim()}`);
      }
    }

    if (sections.length === 0) return '';

    const full = `## Truth Files (ground truth for this series)\n\n${sections.join('\n\n')}`;
    return full.length > maxChars ? full.slice(0, maxChars) + '\n[... truncated]' : full;
  }

  // ─────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────

  static _buildExtractionPrompt(currentTruth, chapterContent, chapterNumber) {
    return {
      system: `You are a story state tracker. Given the current truth files and a new chapter, extract ONLY what changed.

Return JSON with keys for each changed truth file type. If a type didn't change, omit it.

{
  "currentState": "updated character states, new locations...",
  "pendingHooks": "new hooks planted, hooks resolved...",
  "particleLedger": "power level changes, new items..."
}

Rules:
- Only include changes, not the full truth file
- Be concise (1-3 sentences per changed field)
- If nothing changed for a field, omit it entirely`,
      user: `## Current Truth Files

### currentState
${currentTruth.currentState || '(empty)'}

### pendingHooks
${currentTruth.pendingHooks || '(empty)'}

### particleLedger
${currentTruth.particleLedger || '(empty)'}

## New Chapter (Chapter ${chapterNumber})
${(chapterContent || '').slice(0, 4000)}`,
    };
  }

  static _buildInitPrompt(series) {
    return {
      system: `You are a story architect. Given a series synopsis and character sheet, generate the initial 6 truth files as a JSON object.

Return JSON with all 6 keys:
{
  "currentState": "markdown: characters, their initial states, locations",
  "storyBible": "markdown: world rules, terminology, lore",
  "pendingHooks": "markdown: initial plot hooks / mysteries",
  "volumeOutline": "markdown: planned story arc outline",
  "bookRules": "markdown: absolute constraints (character names, genre rules, banned tropes)",
  "particleLedger": "markdown: initial tracked items (power levels, inventory, resources)"
}

Write in Korean if the series is Korean-language.`,
      user: `## Series: ${series.title}
Genre: ${series.genre}
Synopsis: ${series.synopsis || series.description || ''}

Character Sheet:
${typeof series.character_sheet === 'string' ? series.character_sheet : JSON.stringify(series.character_sheet || {}, null, 2)}

World Setting:
${series.world_setting || '(not specified)'}`,
    };
  }

  static _defaultLLMCall() {
    const openaiCompat = require('../../nodes/llm-call/providers/openai-compat');
    return async (system, user, opts = {}) => {
      return openaiCompat.call(
        process.env.DASHSCOPE_MODEL || 'qwen-turbo',
        system, user,
        { provider: 'dashscope', maxOutputTokens: opts.maxOutputTokens || 1024 }
      );
    };
  }
}

module.exports = { TruthManager, TRUTH_TYPES };
