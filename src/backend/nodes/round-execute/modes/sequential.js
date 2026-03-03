/**
 * Sequential Round Mode
 * Agents respond one at a time, with context from all previous responses.
 * Used for Round 2+.
 */

const { generateAgentResponse } = require('../_shared');
const OrchestratorService = require('../../../services/OrchestratorService');

module.exports = {
  /**
   * @param {Object[]} agents - Agents to execute
   * @param {import('../../../engine/WorkflowContext')} ctx
   * @param {number} round
   * @returns {Promise<Object[]>} Round responses
   */
  async execute(agents, ctx, round) {
    const responses = [];

    for (const agent of agents) {
      try {
        const response = await generateAgentResponse({
          agent,
          ctx,
          previousResponses: ctx.allResponses,
          round,
        });
        if (response) responses.push(response);
      } catch (err) {
        console.error(`Agent ${agent.name} failed in round ${round}:`, err.message);
        OrchestratorService.emit(ctx.questionId, 'agent_error', {
          agent: agent.name,
          round,
          error: err.message,
        });
      }
    }

    return responses;
  },
};
