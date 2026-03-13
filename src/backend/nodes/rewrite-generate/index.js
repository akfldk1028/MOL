/**
 * Node: rewrite-generate
 * Generates an improved/rewritten version of the creative work
 * based on critique synthesis feedback.
 */

const promptBuilder = require('./prompt-builder');
const llmCallNode = require('../llm-call');
const OrchestratorService = require('../../services/OrchestratorService');
const { queryOne } = require('../../config/database');

module.exports = {
  type: 'rewrite-generate',
  name: 'Rewrite Generate',
  description: 'Generate an improved version of the creative work based on critique feedback',

  /**
   * @param {import('../../engine/WorkflowContext')} ctx
   * @param {Object} config
   */
  async execute(ctx, config = {}) {
    const channelId = ctx.creationId || ctx.questionId;

    // Update workflow phase
    ctx.workflowPhase = 'rewrite';
    OrchestratorService.emit(channelId, 'phase_change', { phase: 'rewrite' });

    // Pick agent: prefer devil_advocate or respondent
    const agent = ctx.agents.find(a => a.role === 'devil_advocate')
      || ctx.agents.find(a => a.role === 'respondent')
      || ctx.agents[0];

    if (!agent) {
      console.warn('No agent available for rewrite — skipping');
      return { content: null };
    }

    OrchestratorService.emit(channelId, 'agent_thinking', {
      agent: agent.name,
      round: 'rewrite',
    });

    const { systemPrompt, userPrompt } = promptBuilder.buildPrompts(ctx);

    const { content } = await llmCallNode.execute(ctx, {
      agent,
      systemPrompt,
      userPrompt,
    });

    ctx.rewriteContent = content;

    // Persist to DB
    if (ctx.creationId) {
      await queryOne(
        `UPDATE creations SET rewrite_content = $1, rewrite_agent_id = $2, workflow_phase = 'rewrite', updated_at = NOW() WHERE id = $3`,
        [content, agent.id, ctx.creationId]
      );
    }

    // SSE emission handled by sse-broadcast node in the workflow
    return { content };
  },
};
