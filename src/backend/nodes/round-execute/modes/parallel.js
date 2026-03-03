/**
 * Parallel Round Mode
 * All agents respond simultaneously (no context from each other).
 * Used for Round 1.
 */

const { generateAgentResponse } = require('../_shared');

module.exports = {
  /**
   * @param {Object[]} agents - Agents to execute
   * @param {import('../../../engine/WorkflowContext')} ctx
   * @param {number} round
   * @returns {Promise<Object[]>} Round responses
   */
  async execute(agents, ctx, round) {
    const promises = agents.map(agent =>
      generateAgentResponse({ agent, ctx, previousResponses: [], round })
    );

    const results = await Promise.allSettled(promises);
    const responses = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value) {
        responses.push(result.value);
      } else if (result.status === 'rejected') {
        const agentName = agents[i]?.name || `agent-${i}`;
        console.error(`[parallel] Agent "${agentName}" failed in round ${round}:`, result.reason?.message || result.reason);
        const OrchestratorService = require('../../../services/OrchestratorService');
        OrchestratorService.emit(ctx.questionId, 'agent_error', {
          agent: agentName,
          round,
          error: result.reason?.message || 'Unknown error',
        });
      }
    }

    return responses;
  },
};
