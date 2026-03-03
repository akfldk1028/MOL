/**
 * Node: convergence-detect
 * Detects whether the debate has converged (agents are no longer adding new perspectives).
 */

const lengthRatio = require('./strategies/length-ratio');
const roundLimit = require('./strategies/round-limit');

const strategies = {
  'length-ratio': lengthRatio,
  'round-limit': roundLimit,
};

module.exports = {
  type: 'convergence-detect',
  name: 'Convergence Detect',
  description: 'Detect whether agents have converged on an answer',

  /**
   * @param {import('../../engine/WorkflowContext')} ctx
   * @param {Object} config
   * @param {string} [config.strategy='length-ratio']
   */
  async execute(ctx, config = {}) {
    const strategyName = config.strategy || ctx.workflowConfig.convergenceStrategy || 'length-ratio';
    const strategy = strategies[strategyName];
    if (!strategy) throw new Error(`Unknown convergence strategy: "${strategyName}"`);

    // Only check convergence after round 2+
    if (ctx.currentRound < 2 || ctx.latestResponses.length === 0) {
      ctx.converged = false;
      return { converged: false };
    }

    const converged = strategy.detect(ctx.latestResponses, ctx.allResponses, ctx);
    ctx.converged = converged;

    return { converged };
  },

  registerStrategy(name, strategy) {
    strategies[name] = strategy;
  },
};
