/**
 * Plan.js
 * -------
 * Hierarchical DAG decomposition of an analysis goal into subproblems.
 *
 * Pattern: MetaGPT Data Interpreter (arXiv 2402.18679) — "Hierarchical
 * Graph Modeling". Each subproblem is an atomic tool call (SQL query,
 * API fetch, pandas op). Dependencies are edges. The harness executes
 * in topological order.
 */

const crypto = require('crypto');

class Plan {
  /**
   * @param {object} params
   * @param {string} params.goal_id
   * @param {object[]} params.subproblems - [{ id, description, tool, inputs, expected_output }]
   * @param {object} [params.dependencies] - { subproblem_id: [dep_id, ...] }
   */
  constructor({ goal_id, subproblems, dependencies = {} }) {
    if (!goal_id) throw new Error('Plan: goal_id required');
    if (!Array.isArray(subproblems) || subproblems.length === 0) {
      throw new Error('Plan: subproblems must be a non-empty array');
    }
    this.id = crypto.randomUUID();
    this.goal_id = goal_id;
    this.subproblems = subproblems;
    this.dependencies = dependencies;
    this.created_at = new Date().toISOString();
  }

  /**
   * Topological sort — returns subproblems in dependency order.
   * Throws on cycle.
   * @returns {object[]}
   */
  topologicalSort() {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();
    const nodeById = new Map(this.subproblems.map((s) => [s.id, s]));

    const visit = (id) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`Plan: cycle detected at subproblem ${id}`);
      }
      visiting.add(id);
      const deps = this.dependencies[id] || [];
      for (const dep of deps) {
        if (!nodeById.has(dep)) {
          throw new Error(`Plan: subproblem ${id} depends on missing ${dep}`);
        }
        visit(dep);
      }
      visiting.delete(id);
      visited.add(id);
      const node = nodeById.get(id);
      if (node) sorted.push(node);
    };

    for (const s of this.subproblems) visit(s.id);
    return sorted;
  }

  /**
   * Estimate the number of tool calls required.
   */
  estimatedQueries() {
    return this.subproblems.filter((s) => s.tool).length;
  }

  toCGBNode() {
    return {
      id: `plan-${this.id}`,
      type: 'Plan',
      title: `Analysis Plan: ${this.subproblems.length} subproblems`,
      description: this.subproblems.map((s) => s.description).join('\n  - ').slice(0, 500),
      metadata: {
        goal_id: this.goal_id,
        subproblems: this.subproblems,
        dependencies: this.dependencies,
        estimated_queries: this.estimatedQueries(),
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      goal_id: this.goal_id,
      subproblems: this.subproblems,
      dependencies: this.dependencies,
      created_at: this.created_at,
    };
  }
}

module.exports = { Plan };
