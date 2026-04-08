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
const { StoryStateTracker } = require('./StoryStateTracker');
const BrainClient = require('../BrainClient');

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
        evalHistory = await BrainClient.getEvalHistory(agentId, series.title);
        if (evalHistory.goodPatterns.length || evalHistory.antiPatterns.length) {
          this._emit('rl_context', {
            goodPatterns: evalHistory.goodPatterns.length,
            antiPatterns: evalHistory.antiPatterns.length,
            avgScore: evalHistory.avgScore,
          });
        }
      } catch {}
    }

    // ─── Stage 3: Writing (with evaluation loop) ───
    let writeResult = null;
    let evalResult = null;
    let writeAttempt = 0;

    while (writeAttempt <= this.maxEvalRetries) {
      writeAttempt++;
      this._emit('stage_start', { stage: 'writing', agent: 'writer', attempt: writeAttempt });

      const writeConfig = createWritingHarness({
        genre,
        chapterNumber: episodeNumber,
        targetWordCount: this.targetWordCount,
        getContext: async () => {
              const parts = [];
              // S1: Inject StoryStateTracker context (SCORE paper)
              const stateSummary = this.stateTracker.getSummary();
              if (stateSummary) parts.push(stateSummary);
              // Inject previous episode summaries as long-term memory
              if (previousEpisodes.length > 0) {
                parts.push('## Previous Episodes (Long-Term Memory)');
                for (const ep of previousEpisodes.slice(-3)) {
                  parts.push(`Episode ${ep.episode_number}: "${ep.title}" — ${(ep.script_content || '').slice(0, 300)}...`);
                }
              }
              // Level 2: Style reference from CGB (ingested text patterns)
              if (this.getBrainContext) {
                try {
                  const styleNodes = await this.getBrainContext(`${genre} style 명문장 대화 문체`);
                  const styleRefs = (styleNodes || []).filter(n =>
                    n.title?.includes('/style') || n.title?.includes('/dialogue') || n.title?.includes('명문장')
                  ).slice(0, 3);
                  if (styleRefs.length > 0) {
                    parts.push('\n## Writing Style References (from ingested novels)');
                    parts.push('Use these as STYLE REFERENCE — mimic this quality of prose:');
                    for (const ref of styleRefs) {
                      parts.push(`\n### ${ref.title}\n${(ref.description || '').slice(0, 500)}`);
                    }
                  }
                } catch {}
              }
              return parts.length > 0 ? parts.join('\n') : null;
            },
      });
      const writeHarness = new AgentHarness(writeConfig, this.llmCall, this.sharedMemory);
      const chapterPlan = planResult.artifact?.data || planResult.output;
      // C1+I2 fix: inject character sheet + world setting from series context
      const extraPremise = [
        series.synopsis || '',
        this._seriesContext?.worldSetting ? `\n## World Setting\n${this._seriesContext.worldSetting}` : '',
        this._seriesContext?.characterSheet ? `\n## Character Sheet (MUST USE)\n${this._seriesContext.characterSheet}` : '',
      ].filter(Boolean).join('\n');

      const writePrompt = buildWritingPrompt(chapterPlan, previousEpisodes, {
        premise: extraPremise,
        outline: outlineResult.output, // CRITICAL: pass full outline for character consistency
        targetWordCount: this.targetWordCount,
        language: this.language,
      });

      // Inject eval feedback from previous attempt
      let fullWritePrompt = writePrompt;
      if (evalResult && !evalResult.artifact?.data?.passed) {
        const fb = evalResult.artifact?.data?.feedback || evalResult.output;
        fullWritePrompt += `\n\n## Reviewer Feedback (MUST address)\n${fb}`;
      }

      // RL: Inject past evaluation learnings from CGB
      if (evalHistory.goodPatterns.length > 0 || evalHistory.antiPatterns.length > 0) {
        const rlParts = ['\n\n## 이전 에피소드 평가에서 배운 교훈 (RL Feedback)'];
        if (evalHistory.goodPatterns.length > 0) {
          rlParts.push('### ✅ 잘한 점 (이것을 유지하세요)');
          for (const p of evalHistory.goodPatterns.slice(0, 3)) {
            rlParts.push(`- ${p.slice(0, 200)}`);
          }
        }
        if (evalHistory.antiPatterns.length > 0) {
          rlParts.push('### ⛔ 피해야 할 점 (이것은 반복하지 마세요)');
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
      this._emit('stage_complete', {
        stage: 'writing', attempt: writeAttempt,
        wordCount: writeResult.output?.split(/\s+/).length || 0,
      });

      // S1: State validation (SCORE paper) — check before evaluation
      const stateIssues = this.stateTracker.validateEpisode(writeResult.output, episodeNumber);
      if (stateIssues.length > 0) {
        this._emit('state_issues', { count: stateIssues.length, issues: stateIssues.map(i => i.message) });
      }

      // ─── Stage 4: Evaluation ───
      this._emit('stage_start', { stage: 'evaluation', agent: 'evaluator', attempt: writeAttempt });

      const evalConfig = createEvaluationHarness({ genre });
      const evalHarness = new AgentHarness(evalConfig, this.llmCall, this.sharedMemory);
      const evalPrompt = buildEvaluationPrompt(
        writeResult.output,
        outlineData,
        { language: this.language },
      );
      evalResult = await evalHarness.run(evalPrompt);

      const scores = evalResult.artifact?.data || {};
      this._emit('stage_complete', {
        stage: 'evaluation', attempt: writeAttempt,
        overall: scores.overallScore, passed: scores.passed,
      });

      // If passed or max retries reached, exit loop
      if (scores.passed || writeAttempt > this.maxEvalRetries) break;
      this._emit('rewrite_triggered', { attempt: writeAttempt, score: scores.overallScore, feedback: scores.feedback?.slice(0, 200) });
    }

    // ─── Assemble result ───
    const episode = {
      title: writeResult.artifact?.data?.title || `Episode ${episodeNumber}`,
      content: writeResult.output,
      wordCount: writeResult.output?.split(/\s+/).length || 0,
      episodeNumber,
    };

    const durationMs = Date.now() - startTime;
    this._emit('pipeline_complete', { episode: episode.title, wordCount: episode.wordCount, durationMs, attempts: writeAttempt });

    // ─── RL: Record to CGB graph (async, non-blocking) ───
    if (agentId) {
      const evalData = evalResult?.artifact?.data || {};
      // Save episode node
      const prevEpNodeId = episodeNumber > 1 ? `episode-${series.id}-ep${episodeNumber - 1}` : null;
      BrainClient.addEpisodeToGraph(agentId, {
        ...episode, qualityScore: evalData.overallScore, pipelineType: 'storywriter',
      }, series, prevEpNodeId).then(epNodeId => {
        // Save evaluation feedback
        if (epNodeId && evalData.overallScore) {
          BrainClient.recordEvaluation(agentId, evalData, epNodeId, series).then(r => {
            if (r?.promoted) this._emit('rl_promoted', { score: evalData.overallScore });
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    return {
      success: true,
      episode,
      outline: outlineResult.artifact?.data,
      chapterPlan: planResult.artifact?.data,
      evaluation: evalResult?.artifact?.data,
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
