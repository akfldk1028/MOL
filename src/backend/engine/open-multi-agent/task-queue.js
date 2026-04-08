/**
 * TaskQueue — Dependency-aware task queue (ported from OMA task/queue.ts + task/task.ts)
 * @origin clone/open-multi-agent/src/task/queue.ts (commit 607ba57)
 *
 * Event-driven queue with topological dependency resolution.
 * Tasks enter as 'pending', get promoted to 'blocked' when deps are unresolved,
 * and fire 'task:ready' when deps complete.
 */

const { randomUUID } = require('node:crypto');

// ---------------------------------------------------------------------------
// Task factory
// ---------------------------------------------------------------------------

function createTask(input) {
  const now = new Date();
  return {
    id: randomUUID(),
    title: input.title,
    description: input.description,
    status: 'pending',
    assignee: input.assignee,
    dependsOn: input.dependsOn ? [...input.dependsOn] : undefined,
    result: undefined,
    createdAt: now,
    updatedAt: now,
    maxRetries: input.maxRetries,
    retryDelayMs: input.retryDelayMs,
    retryBackoff: input.retryBackoff,
  };
}

// ---------------------------------------------------------------------------
// Readiness check
// ---------------------------------------------------------------------------

function isTaskReady(task, allTasks, taskById) {
  if (task.status !== 'pending') return false;
  if (!task.dependsOn || task.dependsOn.length === 0) return true;
  const map = taskById || new Map(allTasks.map(t => [t.id, t]));
  for (const depId of task.dependsOn) {
    const dep = map.get(depId);
    if (!dep || dep.status !== 'completed') return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Topological sort (Kahn's algorithm)
// ---------------------------------------------------------------------------

function getTaskDependencyOrder(tasks) {
  if (tasks.length === 0) return [];
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const inDegree = new Map();
  const successors = new Map();

  for (const task of tasks) {
    if (!inDegree.has(task.id)) inDegree.set(task.id, 0);
    if (!successors.has(task.id)) successors.set(task.id, []);
    for (const depId of task.dependsOn || []) {
      if (taskById.has(depId)) {
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
        const deps = successors.get(depId) || [];
        deps.push(task.id);
        successors.set(depId, deps);
      }
    }
  }

  const queue = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const ordered = [];
  while (queue.length > 0) {
    const id = queue.shift();
    const task = taskById.get(id);
    if (task) ordered.push(task);
    for (const successorId of successors.get(id) || []) {
      const newDegree = (inDegree.get(successorId) || 0) - 1;
      inDegree.set(successorId, newDegree);
      if (newDegree === 0) queue.push(successorId);
    }
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Dependency validation
// ---------------------------------------------------------------------------

function validateTaskDependencies(tasks) {
  const errors = [];
  const taskById = new Map(tasks.map(t => [t.id, t]));

  for (const task of tasks) {
    for (const depId of task.dependsOn || []) {
      if (depId === task.id) {
        errors.push(`Task "${task.title}" (${task.id}) depends on itself.`);
        continue;
      }
      if (!taskById.has(depId)) {
        errors.push(`Task "${task.title}" (${task.id}) references unknown dependency "${depId}".`);
      }
    }
  }

  // Cycle detection via DFS colouring
  const colour = new Map();
  for (const task of tasks) colour.set(task.id, 0);

  const visit = (id, path) => {
    if (colour.get(id) === 2) return;
    if (colour.get(id) === 1) {
      const cycleStart = path.indexOf(id);
      const cycle = path.slice(cycleStart).concat(id);
      errors.push(`Cyclic dependency detected: ${cycle.join(' -> ')}`);
      return;
    }
    colour.set(id, 1);
    const task = taskById.get(id);
    for (const depId of task?.dependsOn || []) {
      if (taskById.has(depId)) visit(depId, [...path, id]);
    }
    colour.set(id, 2);
  };

  for (const task of tasks) {
    if (colour.get(task.id) === 0) visit(task.id, []);
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// TaskQueue
// ---------------------------------------------------------------------------

class TaskQueue {
  constructor() {
    this.tasks = new Map();
    this.listeners = new Map();
  }

  // --- Add ---
  add(task) {
    const resolved = this._resolveInitialStatus(task);
    this.tasks.set(resolved.id, resolved);
    if (resolved.status === 'pending') {
      this._emit('task:ready', resolved);
    }
  }

  addBatch(tasks) {
    for (const task of tasks) this.add(task);
  }

  // --- Update ---
  update(taskId, update) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    const updated = { ...task, ...update, updatedAt: new Date() };
    this.tasks.set(taskId, updated);
    return updated;
  }

  complete(taskId, result) {
    const completed = this.update(taskId, { status: 'completed', result });
    this._emit('task:complete', completed);
    this._unblockDependents(taskId);
    if (this.isComplete()) this._emit('all:complete');
    return completed;
  }

  fail(taskId, error) {
    const failed = this.update(taskId, { status: 'failed', result: error });
    this._emit('task:failed', failed);
    this._cascadeFailure(taskId);
    if (this.isComplete()) this._emit('all:complete');
    return failed;
  }

  skip(taskId, reason) {
    const skipped = this.update(taskId, { status: 'skipped', result: reason });
    this._emit('task:skipped', skipped);
    this._cascadeFailure(taskId); // same cascade logic
    if (this.isComplete()) this._emit('all:complete');
    return skipped;
  }

  skipRemaining(reason = 'Skipped: approval rejected.') {
    const snapshot = Array.from(this.tasks.values());
    for (const task of snapshot) {
      if (['completed', 'failed', 'skipped'].includes(task.status)) continue;
      const skipped = this.update(task.id, { status: 'skipped', result: reason });
      this._emit('task:skipped', skipped);
    }
    if (this.isComplete()) this._emit('all:complete');
  }

  // --- Query ---
  get(taskId) { return this.tasks.get(taskId) || null; }
  getAll() { return Array.from(this.tasks.values()); }
  getByStatus(status) { return this.getAll().filter(t => t.status === status); }
  size() { return this.tasks.size; }

  isComplete() {
    for (const task of this.tasks.values()) {
      if (!['completed', 'failed', 'skipped'].includes(task.status)) return false;
    }
    return this.tasks.size > 0;
  }

  next() {
    for (const task of this.tasks.values()) {
      if (task.status === 'pending') return task;
    }
    return null;
  }

  // --- Events ---
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Map());
    const key = Symbol();
    this.listeners.get(event).set(key, handler);
    return () => this.listeners.get(event)?.delete(key);
  }

  _emit(event, task) {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers.values()) {
      try { handler(task); } catch (e) { console.error(`TaskQueue event ${event} error:`, e.message); }
    }
  }

  // --- Internal ---
  _resolveInitialStatus(task) {
    if (!task.dependsOn || task.dependsOn.length === 0) return task;
    for (const depId of task.dependsOn) {
      const dep = this.tasks.get(depId);
      if (!dep || dep.status !== 'completed') {
        return { ...task, status: 'blocked' };
      }
    }
    return task;
  }

  _unblockDependents(completedId) {
    for (const task of this.tasks.values()) {
      if (task.status !== 'blocked') continue;
      if (!task.dependsOn?.includes(completedId)) continue;
      // Check if ALL deps are now completed
      const allDepsComplete = task.dependsOn.every(depId => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'completed';
      });
      if (allDepsComplete) {
        this.update(task.id, { status: 'pending' });
        this._emit('task:ready', this.tasks.get(task.id));
      }
    }
  }

  _cascadeFailure(failedId) {
    for (const task of this.tasks.values()) {
      if (['completed', 'failed', 'skipped'].includes(task.status)) continue;
      if (!task.dependsOn?.includes(failedId)) continue;
      const cascaded = this.update(task.id, {
        status: 'failed',
        result: `Upstream task ${failedId} failed`,
      });
      this._emit('task:failed', cascaded);
      // Recursive cascade
      this._cascadeFailure(task.id);
    }
  }
}

module.exports = {
  TaskQueue,
  createTask,
  isTaskReady,
  getTaskDependencyOrder,
  validateTaskDependencies,
};
