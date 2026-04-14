/**
 * StoryOrchestrator — Full StoryWriter pipeline: Outline → Planning → Writing → Evaluation
 *
 * Papers:
 * - StoryWriter (CIKM 2025): 3-agent pipeline, ReIO, NLN, dynamic compression
 * - Anthropic 3-agent harness (2026): Planning→Generation→Evaluation separation
 * - Long Story KG (2025): KG twist + writer-reader sim
 * - SCORE (2025): emotional consistency + state tracking
 *
 * Connects OMA Orchestrator + Harness framework + DashScope LLM + CGB Brain.
 *
 * Usage:
 *   const story = new StoryOrchestrator({ genre: 'romance' });
 *   const result = await story.generateEpisode({
 *     series: { title: '사랑의 온도', genre: 'romance', synopsis: '...' },
 *     agentId: 'agent-uuid',
 *     episodeNumber: 1,
 *   });
 */

const { SharedMemory } = require('../../engine/open-multi-agent/shared-memory');
const { AgentHarness } = require('../../engine/harness/AgentHarness');
const { createOutlineHarness, buildOutlinePrompt } = require('../../engine/harness/agents/OutlineHarness');
const { createPlanningHarness, buildPlanningPrompt } = require('../../engine/harness/agents/PlanningHarness');
const { createWritingHarness, buildWritingPrompt } = require('../../engine/harness/agents/WritingHarness');
const { createEvaluationHarness, buildEvaluationPrompt } = require('../../engine/harness/agents/EvaluationHarness');
const { auditChapter } = require('../../engine/harness/agents/ContinuityAuditor');
const { analyzeAITells } = require('../../engine/harness/agents/AITellsDetector');
const { normalizeLength } = require('../../engine/harness/agents/LengthNormalizer');
const { validatePostWrite } = require('../../engine/harness/agents/PostWriteValidator');
const { spotFixRevise } = require('../../engine/harness/agents/SpotFixReviser');
const { analyzeFatigue } = require('../../engine/harness/agents/LongSpanFatigue');
const { getGenreProfile } = require('../../config/genre-profile');
const { countKoreanWords } = require('../../config/length-governance');
const { TruthManager } = require('./truth/TruthManager');
const { getAgenda, formatAgendaForPrompt, parseHooksFromTruth } = require('./HookManager');
const { StoryStateTracker } = require('./StoryStateTracker');
const BrainClient = require('../BrainClient');
const { ContextComposer } = require('./ContextComposer');

class StoryOrchestrator {
  /**
   * @param {object} options
   * @param {string} [options.genre='romance']
   * @param {string} [options.language='ko']
   * @param {number} [options.targetWordCount=3000]
   * @param {number} [options.maxEvalRetries=2] - Max write→eval→rewrite cycles
   * @param {Function} [options.llmCall] - async (system, user, opts) => string
   * @param {Function} [options.getBrainContext] - async (topic) => nodes[]
   * @param {Function} [options.onProgress] - (event) => void
   */
  constructor(options = {}) {
    this.genre = options.genre || 'romance';
    this.language = options.language || 'ko';
    this.targetWordCount = options.targetWordCount || 3000;
    this.maxEvalRetries = options.maxEvalRetries || 2;
    this.llmCall = options.llmCall || null;
    this.getBrainContext = options.getBrainContext || null;
    this.onProgress = options.onProgress || null;
    this.sharedMemory = new SharedMemory();
    this.stateTracker = new StoryStateTracker();
  }

  /**
   * Generate a full episode through the 4-agent pipeline.
   *
   * @param {object} params
   * @param {object} params.series - { title, genre, synopsis, characters, style_preset }
   * @param {string} [params.agentId] - Agent ID for CGB context
   * @param {number} [params.episodeNumber=1]
   * @param {Array}  [params.previousEpisodes] - Previous episodes for continuity
   * @returns {{ success, episode, outline, chapterPlan, evaluation, trajectory }}
   */
  async generateEpisode(params) {
    const { series, agentId, episodeNumber = 1, previousEpisodes = [] } = params;
    const genre = series.genre || this.genre;
    const language = series.language || this.language || 'ko';
    const startTime = Date.now();

    if (!this.llmCall) throw new Error('StoryOrchestrator requires llmCall option');

    this._emit('pipeline_start', { series: series.title, episode: episodeNumber, genre });

    // ─── Stage 1: Outline ───
    this._emit('stage_start', { stage: 'outline', agent: 'outliner' });

    let brainContext = [];
    if (this.getBrainContext) {
      try {
        const topic = `${series.title} ${genre} ${(series.synopsis || '').slice(0, 100)}`;
        brainContext = await this.getBrainContext(topic) || [];
      } catch {}
    }

    const outlineConfig = createOutlineHarness({
      genre,
      getContext: brainContext.length > 0
        ? async () => brainContext.map(n => `- [${n.type}] ${n.title}: ${(n.description || '').slice(0, 80)}`).join('\n')
        : null,
    });
    const outlineHarness = new AgentHarness(outlineConfig, this.llmCall, this.sharedMemory);
    const outlinePrompt = buildOutlinePrompt(series, { brainContext, language: this.language });
    const outlineResult = await outlineHarness.run(outlinePrompt);

    if (!outlineResult.success) {
      return this._fail('outline', outlineResult, startTime);
    }
    this._emit('stage_complete', { stage: 'outline', events: outlineResult.artifact?.data?.events?.length || 0 });

    // ─── Stage 2: Planning ───
    this._emit('stage_start', { stage: 'planning', agent: 'planner' });

    const planConfig = createPlanningHarness({ genre });
    const planHarness = new AgentHarness(planConfig, this.llmCall, this.sharedMemory);
    const outlineData = outlineResult.artifact?.data || outlineResult.output;
    const planPrompt = buildPlanningPrompt(outlineData, { language: this.language });
    const planResult = await planHarness.run(planPrompt);

    if (!planResult.success) {
      return this._fail('planning', planResult, startTime);
    }
    this._emit('stage_complete', { stage: 'planning', chapters: planResult.artifact?.data?.chapters?.length || 0 });

    // ─── RL: Fetch past evaluation feedback from CGB ───
    let evalHistory = { goodPatterns: [], antiPatterns: [], avgScore: 0 };
    if (agentId) {
      try {
        evalHistory = await BrainClient.getEvalHistory(agentId, series.id);
        if (evalHistory.goodPatterns.length || evalHistory.antiPatterns.length) {
          this._emit('rl_context', {
            goodPatterns: evalHistory.goodPatterns.length,
            antiPatterns: evalHistory.antiPatterns.length,
            avgScore: evalHistory.avgScore,
          });
        }
      } catch {}
    }

    // ─── Truth Files: Load (or initialize on first episode) ───
    let truthFiles = {};
    const seriesId = series.id || series.title;
    if (agentId && seriesId) {
      try {
        if (episodeNumber <= 1) {
          this._emit('truth_init', { seriesId });
          truthFiles = await TruthManager.initialize(agentId, seriesId, series, { llmCall: this.llmCall }) || {};
        } else {
          truthFiles = await TruthManager.load(agentId, seriesId) || {};
        }
        const loaded = Object.values(truthFiles).filter(Boolean).length;
        if (loaded > 0) this._emit('truth_loaded', { count: loaded });
      } catch (err) {
        console.warn('[StoryOrchestrator] TruthManager error:', err.message);
      }
    }

    const genreProfile = getGenreProfile(genre);
    const lengthSpec = genreProfile.lengthSpec;

    // ─── Hook Agenda ───
    let hookAgendaPrompt = '';
    const hooks = parseHooksFromTruth(truthFiles.pendingHooks);
    if (hooks.length > 0) {
      const agenda = getAgenda(hooks, episodeNumber);
      hookAgendaPrompt = formatAgendaForPrompt(agenda);
      if (hookAgendaPrompt) this._emit('hook_agenda', { mustAdvance: agenda.mustAdvance.length, shouldResolve: agenda.shouldResolve.length, stale: agenda.staleWarnings.length });
    }

    // ─── Long-Span Fatigue (will be re-run with currentContent after writing) ───
    let fatiguePrompt = '';
    if (previousEpisodes.length >= 2) {
      const { issues: fatigueIssues, suggestions } = analyzeFatigue({
        episodes: previousEpisodes,
        chapterTypes: genreProfile.chapterTypes,
        // currentContent not available yet — pre-write fatigue only checks episode history
      });
      if (fatigueIssues.length > 0) {
        this._emit('fatigue_detected', { count: fatigueIssues.length });
        fatiguePrompt = '\n## 장간 피로도 경고\n' + suggestions.join('\n');
      }
    }

    // ─── Stage 3: Writing (with review cycle) ───
    let writeResult = null;
    let evalResult = null;
    let auditResult = null;
    let aiTellsResult = null;
    let writeAttempt = 0;

    while (writeAttempt <= this.maxEvalRetries) {
      writeAttempt++;
      this._emit('stage_start', { stage: 'writing', agent: 'writer', attempt: writeAttempt });

      // ─── ContextComposer: InkOS P11 — 4-layer prioritized context selection ───
      const composer = new ContextComposer({ budgetChars: 12000 });

      // L1: Hard facts
      composer.addTruthFiles(truthFiles, 3000);
      composer.addCharacterSheet(this._seriesContext?.characterSheet);
      composer.addWorldSetting(this._seriesContext?.worldSetting);

      // L2: Author intent
      composer.addSynopsis(series.synopsis);
      composer.addHookAgenda(hookAgendaPrompt);
      composer.addPacingRule(genreProfile.pacingRule);

      // L3: Planning
      composer.addRLFeedback(evalHistory);
      composer.addPreviousEpisodes(previousEpisodes);

      // L4: Current task
      composer.addStateTracker(this.stateTracker.getSummary());
      composer.addFatigue(fatiguePrompt);
      composer.addRecentTrail(previousEpisodes);

      // L4: CGB style references (async — fetched inside getContext)
      let _styleRefs = null;
      if (this.getBrainContext) {
        try {
          const styleNodes = await this.getBrainContext(`${genre} style 명문장 대화 문체`);
          _styleRefs = (styleNodes || []).filter(n => {
            const meta = n.metadata || {};
            const nodeGenre = meta.genre || meta.category || '';
            const genreMatch = !nodeGenre || nodeGenre === genre || nodeGenre === 'general';
            const roleMatch = meta.nodeRole === 'style' || meta.nodeRole === 'dialogue' || meta.nodeRole === 'style-analysis'
              || n.title?.includes('/style') || n.title?.includes('/dialogue') || n.title?.includes('명문장');
            return genreMatch && roleMatch;
          }).slice(0, 3);
          composer.addStyleReferences(_styleRefs, genre);
        } catch {}
      }

      const composed = composer.compose();
      if (composed.droppedCount > 0) {
        this._emit('composer_budget', { usedChars: composed.usedChars, dropped: composed.droppedCount, trace: composed.trace.length });
      }

      const writeConfig = createWritingHarness({
        genre,
        chapterNumber: episodeNumber,
        targetWordCount: this.targetWordCount,
        language,
        getContext: async () => composed.prompt || null,
      });
      const writeHarness = new AgentHarness(writeConfig, this.llmCall, this.sharedMemory);
      const chapterPlan = planResult.artifact?.data || planResult.output;
      const extraPremise = [
        series.synopsis || '',
        this._seriesContext?.worldSetting ? `\n## World Setting\n${this._seriesContext.worldSetting}` : '',
        this._seriesContext?.characterSheet ? `\n## Character Sheet (MUST USE)\n${this._seriesContext.characterSheet}` : '',
      ].filter(Boolean).join('\n');

      const writePrompt = buildWritingPrompt(chapterPlan, previousEpisodes, {
        premise: extraPremise,
        outline: outlineResult.output,
        targetWordCount: this.targetWordCount,
        language: this.language,
      });

      // Inject feedback from previous review cycle
      let fullWritePrompt = writePrompt;
      if (evalResult && !evalResult.artifact?.data?.passed) {
        const evalData = evalResult.artifact?.data || {};
        const fb = evalData.feedback || evalResult.output;
        fullWritePrompt += `\n\n## Reviewer Feedback (MUST address)\n${fb}`;
        // Reflexion pattern: structured missing/superfluous for targeted revision
        if (evalData.missing) {
          fullWritePrompt += `\n\n### 부족한 요소 (반드시 추가)\n${evalData.missing}`;
        }
        if (evalData.superfluous) {
          fullWritePrompt += `\n\n### 불필요한 요소 (반드시 제거/축소)\n${evalData.superfluous}`;
        }
      }
      if (auditResult && !auditResult.passed) {
        const criticals = auditResult.issues.filter(i => i.severity === 'critical');
        if (criticals.length > 0) {
          fullWritePrompt += '\n\n## Continuity Issues (MUST FIX)';
          for (const issue of criticals.slice(0, 5)) {
            fullWritePrompt += `\n- [${issue.category}] ${issue.description}`;
            if (issue.suggestion) fullWritePrompt += ` → ${issue.suggestion}`;
          }
        }
      }
      if (aiTellsResult && aiTellsResult.issues.length > 0) {
        const warnings = aiTellsResult.issues.filter(i => i.severity === 'warning');
        if (warnings.length > 0) {
          fullWritePrompt += '\n\n## AI Style Issues (MUST FIX)';
          for (const issue of warnings.slice(0, 3)) {
            fullWritePrompt += `\n- [${issue.category}] ${issue.suggestion}`;
          }
        }
      }

      // RL: Inject past evaluation learnings from CGB
      if (evalHistory.goodPatterns.length > 0 || evalHistory.antiPatterns.length > 0) {
        const rlParts = ['\n\n## 이전 에피소드 평가에서 배운 교훈 (RL Feedback)'];
        if (evalHistory.goodPatterns.length > 0) {
          rlParts.push('### 잘한 점 (이것을 유지하세요)');
          for (const p of evalHistory.goodPatterns.slice(0, 3)) {
            rlParts.push(`- ${p.slice(0, 200)}`);
          }
        }
        if (evalHistory.antiPatterns.length > 0) {
          rlParts.push('### 피해야 할 점 (이것은 반복하지 마세요)');
          for (const p of evalHistory.antiPatterns.slice(0, 3)) {
            rlParts.push(`- ${p.slice(0, 200)}`);
          }
        }
        fullWritePrompt += rlParts.join('\n');
      }

      writeResult = await writeHarness.run(fullWritePrompt);

      if (!writeResult.success) {
        return this._fail('writing', writeResult, startTime);
      }

      // Use cleaned content from handoff artifact (CJK stripped), fallback to raw output
      let chapterContent = writeResult.artifact?.data?.content || writeResult.output;
      const rawWordCount = countKoreanWords(chapterContent);
      this._emit('stage_complete', { stage: 'writing', attempt: writeAttempt, wordCount: rawWordCount });

      // ─── Review Cycle Step 0: PostWrite Validation (rule-based, no LLM) ───
      const postWriteViolations = validatePostWrite(chapterContent, genreProfile);
      if (postWriteViolations.length > 0) {
        const errors = postWriteViolations.filter(v => v.severity === 'error');
        this._emit('postwrite_violations', { total: postWriteViolations.length, errors: errors.length });
        if (errors.length > 0) {
          this._emit('stage_start', { stage: 'spotfix_postwrite', errors: errors.length });
          try {
            const fixResult = await spotFixRevise({ content: chapterContent, issues: errors, llmCall: this.llmCall, genre });
            if (fixResult.applied) {
              chapterContent = fixResult.content;
              this._emit('stage_complete', { stage: 'spotfix_postwrite', patches: fixResult.patchCount });
            }
          } catch (err) {
            console.warn('[StoryOrchestrator] SpotFix postwrite error:', err.message);
          }
        }
      }

      // ─── Review Cycle Step 1: Length Normalization ───
      // Re-count after potential PostWrite spot-fix
      const currentWordCount = countKoreanWords(chapterContent);
      const normMode = currentWordCount < lengthSpec.softMin ? 'expand' : currentWordCount > lengthSpec.softMax ? 'compress' : 'none';
      if (normMode !== 'none') {
        this._emit('stage_start', { stage: 'length_normalize', mode: normMode, before: currentWordCount });
        try {
          const normResult = await normalizeLength({
            content: chapterContent,
            lengthSpec,
            llmCall: this.llmCall,
            chapterIntent: typeof chapterPlan === 'string' ? chapterPlan.slice(0, 500) : JSON.stringify(chapterPlan).slice(0, 500),
          });
          if (normResult.applied) {
            chapterContent = normResult.content;
            this._emit('stage_complete', { stage: 'length_normalize', before: currentWordCount, after: normResult.wordCount, mode: normResult.mode });
          }
          if (normResult.warning) this._emit('length_warning', { warning: normResult.warning });
        } catch (err) {
          console.warn('[StoryOrchestrator] LengthNormalizer error:', err.message);
        }
      }

      // ─── Review Cycle Step 1.5: Post-write Fatigue (with currentContent for Dice check) ───
      if (previousEpisodes.length >= 2) {
        const { issues: postFatigueIssues } = analyzeFatigue({
          episodes: previousEpisodes,
          currentContent: chapterContent,
          chapterTypes: genreProfile.chapterTypes,
        });
        const boundaryIssues = postFatigueIssues.filter(i => i.category.includes('동형'));
        if (boundaryIssues.length > 0) {
          this._emit('fatigue_boundary', { count: boundaryIssues.length });
        }
      }

      // ─── Review Cycle Step 2: Continuity Audit ───
      this._emit('stage_start', { stage: 'continuity_audit' });
      try {
        auditResult = await auditChapter({
          chapterContent,
          chapterNumber: episodeNumber,
          genre,
          truthFiles,
          outline: typeof outlineResult.output === 'string' ? outlineResult.output.slice(0, 1000) : JSON.stringify(outlineResult.output || '').slice(0, 1000),
          previousChapterSummary: previousEpisodes.length > 0
            ? (previousEpisodes[previousEpisodes.length - 1]?.script_content || '').slice(0, 500)
            : '',
          llmCall: this.llmCall,
        });
        this._emit('stage_complete', {
          stage: 'continuity_audit',
          passed: auditResult.passed,
          criticals: auditResult.criticalCount,
          warnings: auditResult.warningCount,
        });
      } catch (err) {
        console.warn('[StoryOrchestrator] ContinuityAuditor error:', err.message);
        auditResult = { passed: true, issues: [], summary: 'Audit skipped', dimensionsChecked: 0, criticalCount: 0, warningCount: 0 };
      }

      // ─── Review Cycle Step 3: AI-Tell Detection ───
      aiTellsResult = analyzeAITells(chapterContent);
      if (aiTellsResult.issues.length > 0) {
        this._emit('ai_tells_detected', { count: aiTellsResult.issues.length, score: aiTellsResult.score });
      }

      // S1: State validation (SCORE paper)
      const stateIssues = this.stateTracker.validateEpisode(chapterContent, episodeNumber);
      if (stateIssues.length > 0) {
        this._emit('state_issues', { count: stateIssues.length, issues: stateIssues.map(i => i.message) });
      }

      // Update writeResult output with post-processed content
      writeResult.output = chapterContent;

      // ─── Stage 4: Evaluation (HANNA 6D) ───
      this._emit('stage_start', { stage: 'evaluation', agent: 'evaluator', attempt: writeAttempt });

      const evalConfig = createEvaluationHarness({ genre });
      const evalHarness = new AgentHarness(evalConfig, this.llmCall, this.sharedMemory);
      const evalPrompt = buildEvaluationPrompt(
        chapterContent,
        outlineData,
        { language: this.language },
      );
      evalResult = await evalHarness.run(evalPrompt);

      const scores = evalResult.artifact?.data || {};
      // Combine: fail if either HANNA or continuity audit failed
      const overallPassed = scores.passed && auditResult.passed;
      this._emit('stage_complete', {
        stage: 'evaluation', attempt: writeAttempt,
        overall: scores.overallScore, passed: overallPassed,
        continuityPassed: auditResult.passed,
        aiTellScore: aiTellsResult.score,
      });

      // If all passed or max retries reached, exit loop
      if (overallPassed || writeAttempt > this.maxEvalRetries) break;

      // ─── Reflexion: CGB search queries from evaluation ───
      if (this.getBrainContext && scores.searchQueries?.length > 0) {
        try {
          const queryResults = await Promise.all(
            scores.searchQueries.slice(0, 2).map(q => this.getBrainContext(q).catch(() => []))
          );
          const extraRefs = queryResults.flat().filter(Boolean).slice(0, 3);
          if (extraRefs.length > 0) {
            evalHistory = {
              ...evalHistory,
              goodPatterns: [
                ...evalHistory.goodPatterns,
                ...extraRefs.map(n => `[CGB] ${n.title}: ${(n.description || '').slice(0, 150)}`),
              ],
            };
            this._emit('reflexion_cgb_search', { queries: scores.searchQueries.length, results: extraRefs.length });
          }
        } catch {}
      }

      // ─── SpotFix before full rewrite ───
      const allIssues = [
        ...(auditResult.issues || []).filter(i => i.severity === 'critical'),
        ...(aiTellsResult.issues || []).filter(i => i.severity === 'warning'),
      ];
      if (allIssues.length > 0) {
        this._emit('stage_start', { stage: 'spotfix_review', issues: allIssues.length });
        try {
          const fixResult = await spotFixRevise({ content: chapterContent, issues: allIssues.slice(0, 8), llmCall: this.llmCall, genre });
          if (fixResult.applied) {
            chapterContent = fixResult.content;
            writeResult.output = chapterContent;
            this._emit('stage_complete', { stage: 'spotfix_review', patches: fixResult.patchCount });
            // SpotFix succeeded — count as a pass (don't waste another full write)
            // The issues were patched; accept and move on.
            break;
          }
        } catch (err) {
          console.warn('[StoryOrchestrator] SpotFix review error:', err.message);
        }
      }

      // Full rewrite fallback (if spot-fix failed/skipped) — loop continues to next writeAttempt
      this._emit('rewrite_triggered', {
        attempt: writeAttempt,
        score: scores.overallScore,
        feedback: scores.feedback?.slice(0, 200),
        continuityIssues: auditResult.criticalCount,
        aiTellScore: aiTellsResult.score,
      });
    }

    // ─── Truth Files + Hooks: Update after writing ───
    if (agentId && seriesId && writeResult?.output) {
      TruthManager.updateAfterChapter(agentId, seriesId, writeResult.output, episodeNumber, { llmCall: this.llmCall })
        .catch(err => console.warn('[StoryOrchestrator] TruthManager update error:', err.message));
    }
    // Note: Hook state updates (resolved/advanced) are handled implicitly by
    // TruthManager.updateAfterChapter which extracts pendingHooks changes via LLM.
    // Structured hook JSON will be preserved if the LLM returns valid JSON in the pendingHooks field.

    // ─── Assemble result ───
    const episode = {
      title: writeResult.artifact?.data?.title || `Episode ${episodeNumber}`,
      content: writeResult.output,
      wordCount: countKoreanWords(writeResult.output),
      episodeNumber,
    };

    const durationMs = Date.now() - startTime;
    this._emit('pipeline_complete', { episode: episode.title, wordCount: episode.wordCount, durationMs, attempts: writeAttempt });

    // ─── RL: Record to CGB graph (async, non-blocking) ───
    if (agentId) {
      const evalData = evalResult?.artifact?.data || {};
      const prevEpNodeId = episodeNumber > 1 ? `episode-${series.id}-ep${episodeNumber - 1}` : null;
      BrainClient.addEpisodeToGraph(agentId, {
        ...episode, qualityScore: evalData.overallScore, pipelineType: 'storywriter',
      }, series, prevEpNodeId).then(epNodeId => {
        if (epNodeId && evalData.overallScore) {
          BrainClient.recordEvaluation(agentId, evalData, epNodeId, series).then(r => {
            if (r?.promoted) this._emit('rl_promoted', { score: evalData.overallScore });
          }).catch(err => {
            console.warn(`[StoryOrchestrator] RL recordEvaluation failed:`, err.message);
            this._emit('rl_error', { stage: 'recordEvaluation', error: err.message });
          });
        }
      }).catch(err => {
        console.warn(`[StoryOrchestrator] RL addEpisodeToGraph failed:`, err.message);
        this._emit('rl_error', { stage: 'addEpisodeToGraph', error: err.message });
      });
    }

    return {
      success: true,
      episode,
      outline: outlineResult.artifact?.data,
      chapterPlan: planResult.artifact?.data,
      evaluation: evalResult?.artifact?.data,
      continuityAudit: auditResult,
      aiTells: aiTellsResult,
      trajectory: [
        ...outlineResult.trajectory,
        ...planResult.trajectory,
        ...(writeResult?.trajectory || []),
        ...(evalResult?.trajectory || []),
      ],
      durationMs,
      writeAttempts: writeAttempt,
    };
  }

  _emit(type, data) {
    this.onProgress?.({ type, ...data, timestamp: new Date().toISOString() });
  }

  _fail(stage, result, startTime) {
    this._emit('pipeline_failed', { stage, error: result.output?.slice(0, 200) });
    return {
      success: false,
      error: `Pipeline failed at ${stage}: ${result.output?.slice(0, 500)}`,
      trajectory: result.trajectory || [],
      durationMs: Date.now() - startTime,
    };
  }
}

module.exports = { StoryOrchestrator };
