/**
 * Workflow Engine JSDoc Type Definitions
 *
 * @typedef {Object} NodeDefinition
 * @property {string} type - Unique node type identifier
 * @property {string} name - Human-readable name
 * @property {string} description - What this node does
 * @property {function(WorkflowContext, Object): Promise<Object>} execute - Node execution function
 *
 * @typedef {Object} WorkflowNode
 * @property {string} id - Unique node instance ID within the workflow
 * @property {string} type - Node type (maps to NodeDefinition)
 * @property {Object} [config] - Node-specific configuration
 *
 * @typedef {Object} WorkflowEdge
 * @property {string} from - Source node ID
 * @property {string} to - Target node ID
 * @property {string} [condition] - JavaScript expression evaluated against context
 *
 * @typedef {Object} WorkflowDefinition
 * @property {string} id - Workflow identifier
 * @property {string} name - Human-readable name
 * @property {string} version - Semver version
 * @property {Object} config - Global workflow config
 * @property {number} config.maxRounds - Maximum debate rounds
 * @property {string} config.convergenceStrategy - Strategy name
 * @property {string} config.synthesisFormat - Synthesis format name
 * @property {string} config.roundMode - Round execution mode
 * @property {WorkflowNode[]} nodes - Node instances
 * @property {WorkflowEdge[]} edges - Node connections
 *
 * @typedef {Object} NodeResult
 * @property {boolean} success - Whether the node succeeded
 * @property {Object} data - Output data from the node
 * @property {string} [error] - Error message if failed
 *
 * @typedef {Object} ExecutionLog
 * @property {string} nodeId - Node instance ID
 * @property {string} nodeType - Node type
 * @property {string} status - running | completed | failed
 * @property {Object} input - Input data
 * @property {Object} output - Output data
 * @property {string} [error] - Error message
 * @property {number} durationMs - Execution time in ms
 * @property {Date} startedAt
 * @property {Date} [completedAt]
 */

module.exports = {};
