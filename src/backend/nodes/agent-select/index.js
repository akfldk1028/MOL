/**
 * Node: agent-select
 * Selects debate agents based on a strategy.
 * Default strategy: complexity (current behavior).
 */

const complexityStrategy = require('./strategies/complexity');
const domainStrategy = require('./strategies/domain');

const strategies = {
  complexity: complexityStrategy,
  domain: domainStrategy,
};

module.exports = {
  type: 'agent-select',
  name: 'Agent Select',
  description: 'Select agents for the debate based on strategy',

  /**
   * @param {import('../../engine/WorkflowContext')} ctx
   * @param {Object} config
   * @param {string} [config.strategy='complexity']
   * @returns {Promise<{agents: Object[]}>}
   */
  async execute(ctx, config = {}) {
    // Auto-select domain strategy for non-general domains
    let strategyName = config.strategy || 'complexity';
    if (strategyName === 'complexity' && ctx.domainSlug && ctx.domainSlug !== 'general') {
      strategyName = 'domain';
    }
    const strategy = strategies[strategyName];
    if (!strategy) throw new Error(`Unknown agent-select strategy: "${strategyName}"`);

    const agents = await strategy.select(ctx);
    ctx.agents = agents;

    return { agents: agents.map(a => ({ name: a.name, role: a.role, llmProvider: a.llm_provider })) };
  },

  /**
   * Register a new strategy at runtime (for domain strategies)
   */
  registerStrategy(name, strategy) {
    strategies[name] = strategy;
  },
};
