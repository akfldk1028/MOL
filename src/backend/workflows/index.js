/**
 * Workflow Registry
 * Loads and provides access to workflow definitions.
 */

const fs = require('fs');
const path = require('path');

/** @type {Map<string, Object>} */
const registry = new Map();

const WorkflowRegistry = {
  /**
   * Load all workflows from the workflows/ directory
   */
  loadAll() {
    const workflowsDir = __dirname;
    const entries = fs.readdirSync(workflowsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const jsonPath = path.join(workflowsDir, entry.name, 'workflow.json');
      if (!fs.existsSync(jsonPath)) continue;

      try {
        const workflow = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        registry.set(workflow.id, workflow);
        console.log(`  Workflow loaded: ${workflow.id} (${workflow.nodes?.length || 0} nodes)`);
      } catch (err) {
        console.error(`  Failed to load workflow "${entry.name}": ${err.message}`);
      }
    }

    console.log(`Loaded ${registry.size} workflow(s)`);
  },

  /**
   * Get a workflow by ID
   * @param {string} id
   * @returns {Object|null}
   */
  get(id) {
    return registry.get(id) || null;
  },

  /**
   * List all workflows
   * @returns {Object[]}
   */
  list() {
    return [...registry.values()].map(w => ({
      id: w.id,
      name: w.name,
      version: w.version,
      nodeCount: w.nodes?.length || 0,
    }));
  },
};

module.exports = WorkflowRegistry;
