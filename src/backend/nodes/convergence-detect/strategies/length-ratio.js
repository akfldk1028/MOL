/**
 * Convergence Strategy: Length Ratio
 * Extracted from OrchestratorService._detectConvergence
 *
 * If latest round responses are 40% shorter than previous average, consider converged.
 */

module.exports = {
  /**
   * @param {Object[]} latestResponses - Current round responses
   * @param {Object[]} allResponses - All responses so far
   * @returns {boolean}
   */
  detect(latestResponses, allResponses) {
    const avgLength = latestResponses.reduce((sum, r) => sum + r.content.length, 0) / latestResponses.length;
    const previousResponses = allResponses.filter(r => !latestResponses.includes(r));
    const prevAvgLength = previousResponses.reduce((sum, r) => sum + r.content.length, 0) / Math.max(1, previousResponses.length);

    return prevAvgLength > 0 && avgLength < prevAvgLength * 0.4;
  },
};
