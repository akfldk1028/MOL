/**
 * Scheduler — Task scheduling strategies (ported from OMA orchestrator/scheduler.ts)
 * @origin clone/open-multi-agent/src/orchestrator/scheduler.ts (commit 607ba57)
 *
 * 4 strategies: round-robin, least-busy, capability-match, dependency-first.
 * Default: dependency-first (best for story pipelines).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countBlockedDependents(taskId, allTasks) {
  const dependents = new Map();
  for (const t of allTasks) {
    for (const depId of t.dependsOn || []) {
      const list = dependents.get(depId) || [];
      list.push(t.id);
      dependents.set(depId, list);
    }
  }
  const visited = new Set();
  const queue = [taskId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const depId of dependents.get(current) || []) {
      if (!visited.has(depId)) {
        visited.add(depId);
        queue.push(depId);
      }
    }
  }
  return visited.size;
}

function extractKeywords(text) {
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'are', 'from', 'have',
    'will', 'your', 'you', 'can', 'all', 'each', 'when', 'then', 'they',
    'them', 'their', 'about', 'into', 'more', 'also', 'should', 'must',
  ]);
  return [...new Set(
    text.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w)),
  )];
}

function keywordScore(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.reduce((acc, kw) => acc + (lower.includes(kw.toLowerCase()) ? 1 : 0), 0);
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

class Scheduler {
  constructor(strategy = 'dependency-first') {
    this.strategy = strategy;
    this._cursor = 0;
  }

  /**
   * Assign unassigned pending tasks to agents.
   * @returns Map<taskId, agentName>
   */
  schedule(tasks, agents) {
    if (agents.length === 0) return new Map();
    const unassigned = tasks.filter(t => t.status === 'pending' && !t.assignee);

    switch (this.strategy) {
      case 'round-robin': return this._roundRobin(unassigned, agents);
      case 'least-busy': return this._leastBusy(unassigned, agents, tasks);
      case 'capability-match': return this._capabilityMatch(unassigned, agents);
      case 'dependency-first': return this._dependencyFirst(unassigned, agents, tasks);
      default: return this._dependencyFirst(unassigned, agents, tasks);
    }
  }

  /**
   * Apply assignments directly to a TaskQueue.
   */
  autoAssign(queue, agents) {
    const allTasks = queue.getAll();
    const assignments = this.schedule(allTasks, agents);
    for (const [taskId, agentName] of assignments) {
      try { queue.update(taskId, { assignee: agentName }); } catch {}
    }
  }

  // --- Strategies ---

  _roundRobin(unassigned, agents) {
    const result = new Map();
    for (const task of unassigned) {
      result.set(task.id, agents[this._cursor % agents.length].name);
      this._cursor = (this._cursor + 1) % agents.length;
    }
    return result;
  }

  _leastBusy(unassigned, agents, allTasks) {
    const load = new Map(agents.map(a => [a.name, 0]));
    for (const t of allTasks) {
      if (t.status === 'in_progress' && t.assignee) {
        load.set(t.assignee, (load.get(t.assignee) || 0) + 1);
      }
    }
    const result = new Map();
    for (const task of unassigned) {
      let bestAgent = agents[0];
      let bestLoad = load.get(bestAgent.name) || 0;
      for (let i = 1; i < agents.length; i++) {
        const agentLoad = load.get(agents[i].name) || 0;
        if (agentLoad < bestLoad) { bestLoad = agentLoad; bestAgent = agents[i]; }
      }
      result.set(task.id, bestAgent.name);
      load.set(bestAgent.name, (load.get(bestAgent.name) || 0) + 1);
    }
    return result;
  }

  _capabilityMatch(unassigned, agents) {
    const agentKW = new Map(agents.map(a => [a.name, extractKeywords(`${a.name} ${a.systemPrompt || ''}`)]));
    const result = new Map();
    for (const task of unassigned) {
      const taskKW = extractKeywords(`${task.title} ${task.description}`);
      let bestAgent = agents[0], bestScore = -1;
      for (const agent of agents) {
        const score = keywordScore(`${agent.name} ${agent.systemPrompt || ''}`, taskKW) +
                      keywordScore(`${task.title} ${task.description}`, agentKW.get(agent.name) || []);
        if (score > bestScore) { bestScore = score; bestAgent = agent; }
      }
      result.set(task.id, bestAgent.name);
    }
    return result;
  }

  _dependencyFirst(unassigned, agents, allTasks) {
    const ranked = [...unassigned].sort((a, b) =>
      countBlockedDependents(b.id, allTasks) - countBlockedDependents(a.id, allTasks)
    );
    const result = new Map();
    let cursor = this._cursor;
    for (const task of ranked) {
      result.set(task.id, agents[cursor % agents.length].name);
      cursor = (cursor + 1) % agents.length;
    }
    this._cursor = cursor;
    return result;
  }
}

module.exports = { Scheduler };
