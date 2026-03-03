/**
 * NodeRegistry
 * Central registry for all available node types.
 * Nodes register themselves here; the WorkflowEngine looks up nodes by type.
 */

/** @type {Map<string, import('./types').NodeDefinition>} */
const registry = new Map();

const NodeRegistry = {
  /**
   * Register a node definition
   * @param {import('./types').NodeDefinition} definition
   */
  register(definition) {
    if (!definition.type) throw new Error('Node definition must have a type');
    if (!definition.execute) throw new Error(`Node "${definition.type}" must have an execute function`);
    if (registry.has(definition.type)) {
      console.warn(`Node type "${definition.type}" is being re-registered`);
    }
    registry.set(definition.type, definition);
  },

  /**
   * Get a node definition by type
   * @param {string} type
   * @returns {import('./types').NodeDefinition}
   */
  get(type) {
    const def = registry.get(type);
    if (!def) throw new Error(`Unknown node type: "${type}". Available: ${[...registry.keys()].join(', ')}`);
    return def;
  },

  /**
   * Check if a node type is registered
   * @param {string} type
   * @returns {boolean}
   */
  has(type) {
    return registry.has(type);
  },

  /**
   * List all registered node types
   * @returns {string[]}
   */
  list() {
    return [...registry.keys()];
  },

  /**
   * Clear registry (for testing)
   */
  clear() {
    registry.clear();
  },
};

module.exports = NodeRegistry;
