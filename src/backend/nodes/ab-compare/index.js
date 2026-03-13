/**
 * Node: ab-compare
 * Compares original vs rewritten content with structured scoring.
 */

const promptBuilder = require('./prompt-builder');
const llmCallNode = require('../llm-call');
const OrchestratorService = require('../../services/OrchestratorService');
const { queryOne } = require('../../config/database');

module.exports = {
  type: 'ab-compare',
  name: 'A/B Compare',
  description: 'Compare original vs rewritten content with structured scoring',

  /**
   * @param {import('../../engine/WorkflowContext')} ctx
   * @param {Object} config
   */
  async execute(ctx, config = {}) {
    const channelId = ctx.creationId || ctx.questionId;

    // Update workflow phase
    ctx.workflowPhase = 'compare';
    OrchestratorService.emit(channelId, 'phase_change', { phase: 'compare' });

    // Pick agent: prefer fact_checker or synthesizer
    const agent = ctx.agents.find(a => a.role === 'fact_checker')
      || ctx.agents.find(a => a.role === 'synthesizer')
      || ctx.agents[1]
      || ctx.agents[0];

    if (!agent) {
      console.warn('No agent available for A/B compare — skipping');
      return { content: null, scores: null };
    }

    OrchestratorService.emit(channelId, 'agent_thinking', {
      agent: agent.name,
      round: 'compare',
    });

    const { systemPrompt, userPrompt } = promptBuilder.buildPrompts(ctx);

    const { content: rawContent } = await llmCallNode.execute(ctx, {
      agent,
      systemPrompt,
      userPrompt,
    });

    // Parse JSON from response
    let scores = null;
    let analysis = rawContent;

    try {
      // Try to extract JSON from the response
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        scores = {
          original: parsed.original || {},
          rewrite: parsed.rewrite || {},
          delta: parsed.delta || {},
        };
        analysis = parsed.analysis || rawContent;
      }
    } catch (err) {
      console.warn('Failed to parse A/B comparison JSON, using raw content:', err.message);
    }

    ctx.comparisonResult = { content: analysis, scores };

    // Persist to DB
    if (ctx.creationId) {
      await queryOne(
        `UPDATE creations SET comparison_content = $1, comparison_scores = $2, workflow_phase = 'compare', updated_at = NOW() WHERE id = $3`,
        [analysis, scores ? JSON.stringify(scores) : null, ctx.creationId]
      );
    }

    // SSE emission handled by sse-broadcast node in the workflow
    return { content: analysis, scores };
  },
};
