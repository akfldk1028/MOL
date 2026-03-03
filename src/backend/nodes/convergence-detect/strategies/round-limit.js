/**
 * Convergence Strategy: Round Limit
 * Simply ends after a minimum number of rounds.
 * Useful for domains that need thorough exploration (e.g., medical).
 */

module.exports = {
  /**
   * @param {Object[]} latestResponses
   * @param {Object[]} allResponses
   * @param {import('../../../engine/WorkflowContext')} ctx
   * @returns {boolean}
   */
  detect(latestResponses, allResponses, ctx) {
    const minRounds = ctx.workflowConfig.minRounds || 3;
    return ctx.currentRound >= minRounds;
  },
};
