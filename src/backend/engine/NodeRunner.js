/**
 * NodeRunner
 * Executes a single node with logging, timing, and error handling.
 */

const NodeRegistry = require('./NodeRegistry');

const NodeRunner = {
  /**
   * Execute a single workflow node
   * @param {import('./types').WorkflowNode} node - Node instance from workflow definition
   * @param {import('./WorkflowContext')} context - Shared workflow context
   * @returns {Promise<import('./types').NodeResult>}
   */
  async execute(node, context) {
    const definition = NodeRegistry.get(node.type);
    const startedAt = new Date();

    const log = {
      nodeId: node.id,
      nodeType: node.type,
      status: 'running',
      input: node.config || {},
      output: {},
      error: null,
      durationMs: 0,
      startedAt,
      completedAt: null,
    };

    try {
      const result = await definition.execute(context, node.config || {});

      log.status = 'completed';
      log.output = result || {};
      log.completedAt = new Date();
      log.durationMs = log.completedAt - startedAt;
      context.addLog(log);

      return { success: true, data: result || {} };
    } catch (err) {
      log.status = 'failed';
      log.error = err.message;
      log.completedAt = new Date();
      log.durationMs = log.completedAt - startedAt;
      context.addLog(log);
      context.addError(node.id, err);

      return { success: false, data: {}, error: err.message };
    }
  },
};

module.exports = NodeRunner;
