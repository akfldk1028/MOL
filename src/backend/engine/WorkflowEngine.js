/**
 * WorkflowEngine
 * Executes a workflow definition (JSON graph) by traversing nodes via edges.
 * Supports conditional edges for loops (round iteration) and branching.
 */

const NodeRunner = require('./NodeRunner');

class WorkflowEngine {
  /**
   * Execute a workflow from start to finish
   * @param {import('./types').WorkflowDefinition} workflow - The workflow definition
   * @param {import('./WorkflowContext')} context - Shared context
   */
  static async execute(workflow, context) {
    const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));
    const edgeMap = this._buildEdgeMap(workflow.edges);

    // Find the start node (first node with no incoming edges)
    const startNodeId = this._findStartNode(workflow);
    let currentNodeId = startNodeId;

    const visited = new Set(); // cycle detection per unique state
    const MAX_ITERATIONS = 100; // safety limit
    let iterations = 0;

    while (currentNodeId && iterations < MAX_ITERATIONS) {
      iterations++;
      const node = nodeMap.get(currentNodeId);
      if (!node) {
        console.error(`WorkflowEngine: node "${currentNodeId}" not found in workflow "${workflow.id}"`);
        break;
      }

      // Execute the node
      const result = await NodeRunner.execute(node, context);

      // If a critical node fails, abort the workflow
      if (!result.success && this._isCriticalNode(node.type)) {
        console.error(`WorkflowEngine: critical node "${node.id}" failed: ${result.error}`);
        break;
      }

      // Find the next node via edges
      currentNodeId = this._resolveNextNode(node.id, edgeMap, context);

      // Cycle detection: use (nodeId + round) as key to allow legitimate loops
      const stateKey = `${currentNodeId}:${context.currentRound}`;
      if (visited.has(stateKey)) {
        console.warn(`WorkflowEngine: potential infinite loop at "${currentNodeId}" round ${context.currentRound}`);
        break;
      }
      if (currentNodeId) visited.add(stateKey);
    }

    if (iterations >= MAX_ITERATIONS) {
      console.error(`WorkflowEngine: hit max iterations (${MAX_ITERATIONS}) for workflow "${workflow.id}"`);
    }
  }

  /**
   * Build a map of nodeId -> outgoing edges
   * @param {import('./types').WorkflowEdge[]} edges
   * @returns {Map<string, import('./types').WorkflowEdge[]>}
   */
  static _buildEdgeMap(edges) {
    const map = new Map();
    for (const edge of edges) {
      if (!map.has(edge.from)) map.set(edge.from, []);
      map.get(edge.from).push(edge);
    }
    return map;
  }

  /**
   * Find the start node — the first node that has no incoming edges
   */
  static _findStartNode(workflow) {
    const incomingTargets = new Set(workflow.edges.map(e => e.to));
    const startNode = workflow.nodes.find(n => !incomingTargets.has(n.id));
    if (!startNode) {
      // Fallback to first node
      return workflow.nodes[0]?.id;
    }
    return startNode.id;
  }

  /**
   * Resolve which node to go to next based on edges and conditions
   */
  static _resolveNextNode(currentNodeId, edgeMap, context) {
    const edges = edgeMap.get(currentNodeId);
    if (!edges || edges.length === 0) return null;

    // If only one edge with no condition, follow it
    if (edges.length === 1 && !edges[0].condition) {
      return edges[0].to;
    }

    // Evaluate conditional edges in order
    for (const edge of edges) {
      if (!edge.condition) continue;
      if (context.evaluateCondition(edge.condition)) {
        return edge.to;
      }
    }

    // Fallback: unconditional edge
    const unconditional = edges.find(e => !e.condition);
    return unconditional ? unconditional.to : null;
  }

  /**
   * Nodes that should abort the workflow if they fail
   */
  static _isCriticalNode(nodeType) {
    return ['credit-check', 'agent-select'].includes(nodeType);
  }
}

module.exports = WorkflowEngine;
