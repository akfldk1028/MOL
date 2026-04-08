/**
 * Orchestrator — Multi-agent task orchestration (ported from OMA orchestrator.ts)
 * @origin clone/open-multi-agent/src/orchestrator/orchestrator.ts (commit 607ba57)
 *
 * Coordinator pattern: goal → LLM decomposes into Task DAG → agents execute in dependency order.
 * Adapted for MOL: DashScope LLM, CGB Brain context, DB SharedMemory.
 *
 * Usage:
 *   const orch = new Orchestrator({ maxConcurrency: 3 });
 *   const team = orch.createTeam('story', { agents: [...] });
 *   const result = await orch.runTeam(team, '로맨스 소설 1화 작성');
 */

const { TaskQueue, createTask, validateTaskDependencies } = require('./task-queue');
const { Semaphore } = require('./semaphore');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_RETRY_DELAY_MS = 30_000;

function computeRetryDelay(baseDelay, backoff, attempt) {
  return Math.min(baseDelay * backoff ** (attempt - 1), MAX_RETRY_DELAY_MS);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse coordinator's JSON task specs from raw LLM output.
 * Looks for ```json ... ``` fence or bare JSON array.
 */
function parseTaskSpecs(raw) {
  const fenceMatch = raw.match(/```json\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : raw;
  const arrayStart = candidate.indexOf('[');
  const arrayEnd = candidate.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) return null;

  try {
    const parsed = JSON.parse(candidate.slice(arrayStart, arrayEnd + 1));
    if (!Array.isArray(parsed)) return null;

    const specs = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      if (typeof item.title !== 'string' || typeof item.description !== 'string') continue;
      specs.push({
        title: item.title,
        description: item.description,
        assignee: typeof item.assignee === 'string' ? item.assignee : undefined,
        dependsOn: Array.isArray(item.dependsOn)
          ? item.dependsOn.filter(x => typeof x === 'string')
          : undefined,
      });
    }
    return specs.length > 0 ? specs : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Execute with retry
// ---------------------------------------------------------------------------

async function executeWithRetry(run, task, onRetry) {
  const maxAttempts = Math.max(0, task.maxRetries || 0) + 1;
  const baseDelay = Math.max(0, task.retryDelayMs || 1000);
  const backoff = Math.max(1, task.retryBackoff || 2);
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await run();
      if (result.success) return result;
      lastError = result.output || 'Unknown error';
      if (attempt < maxAttempts) {
        const delay = computeRetryDelay(baseDelay, backoff, attempt);
        onRetry?.({ attempt, maxAttempts, error: lastError, nextDelayMs: delay });
        await sleep(delay);
        continue;
      }
      return result;
    } catch (err) {
      lastError = err.message || String(err);
      if (attempt < maxAttempts) {
        const delay = computeRetryDelay(baseDelay, backoff, attempt);
        onRetry?.({ attempt, maxAttempts, error: lastError, nextDelayMs: delay });
        await sleep(delay);
        continue;
      }
      return { success: false, output: lastError };
    }
  }
  return { success: false, output: lastError };
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

class Team {
  constructor(config) {
    this.name = config.name || 'default';
    this.agents = new Map(); // name → { name, systemPrompt, run(prompt) }
    this.sharedMemory = new Map(); // key → { value, agent, timestamp }

    for (const agent of config.agents || []) {
      this.agents.set(agent.name, agent);
    }
  }

  getAgents() { return Array.from(this.agents.values()); }
  getAgent(name) { return this.agents.get(name) || null; }

  // SharedMemory (in-process, backed by DB via Orchestrator)
  async writeMemory(agentName, key, value) {
    this.sharedMemory.set(`${agentName}/${key}`, { value, agent: agentName, timestamp: new Date() });
  }

  async readMemory(key) {
    return this.sharedMemory.get(key)?.value || null;
  }

  async getMemorySummary() {
    if (this.sharedMemory.size === 0) return null;
    const lines = ['## Team Shared Memory'];
    for (const [key, entry] of this.sharedMemory) {
      const preview = entry.value.length > 200 ? entry.value.slice(0, 200) + '...' : entry.value;
      lines.push(`- **${key}**: ${preview}`);
    }
    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

class Orchestrator {
  constructor(config = {}) {
    this.maxConcurrency = config.maxConcurrency || 5;
    this.onProgress = config.onProgress || null;
    this.teams = new Map();
  }

  /**
   * Create a team of agents.
   * Each agent: { name, systemPrompt, run: async (prompt) => { success, output } }
   */
  createTeam(name, config) {
    const team = new Team({ ...config, name });
    this.teams.set(name, team);
    return team;
  }

  /**
   * Run a single agent with a prompt (one-shot).
   */
  async runAgent(agent, prompt) {
    return agent.run(prompt);
  }

  /**
   * Coordinator pattern: LLM decomposes goal → Task DAG → parallel execution.
   *
   * @param {Team} team - Team with registered agents
   * @param {string} goal - High-level goal (e.g., "로맨스 소설 1화 작성")
   * @param {object} [options] - { coordinatorLLM, maxRetries }
   * @returns {{ success, results, queue }}
   */
  async runTeam(team, goal, options = {}) {
    const { coordinatorLLM, maxRetries = 1 } = options;

    // Step 1: Coordinator decomposes goal into tasks
    const agentRoster = team.getAgents().map(a => `- ${a.name}: ${a.systemPrompt?.slice(0, 100) || 'general'}`).join('\n');
    const coordinatorPrompt = `You are a coordinator. Decompose this goal into a task plan.

## Goal
${goal}

## Available Agents
${agentRoster}

## Instructions
Break the goal into tasks. Each task should be assigned to one agent.
Tasks can depend on other tasks (by title).
Return a JSON array inside \`\`\`json ... \`\`\` fence:

\`\`\`json
[
  { "title": "task name", "description": "what to do", "assignee": "agent_name", "dependsOn": [] },
  { "title": "task 2", "description": "...", "assignee": "agent_name", "dependsOn": ["task name"] }
]
\`\`\``;

    // Call coordinator LLM
    if (!coordinatorLLM) {
      throw new Error('Orchestrator.runTeam requires options.coordinatorLLM (async function)');
    }
    const coordResult = await coordinatorLLM(coordinatorPrompt);
    const specs = parseTaskSpecs(coordResult);
    if (!specs || specs.length === 0) {
      return { success: false, output: 'Coordinator failed to produce valid task specs', results: new Map() };
    }

    // Convert specs → tasks with proper dependency IDs
    const titleToId = new Map();
    const tasks = specs.map(spec => {
      const task = createTask({
        title: spec.title,
        description: spec.description,
        assignee: spec.assignee,
        maxRetries,
      });
      titleToId.set(spec.title, task.id);
      return { task, rawDeps: spec.dependsOn || [] };
    });

    // Resolve dependsOn title → id
    for (const { task, rawDeps } of tasks) {
      task.dependsOn = rawDeps.map(dep => titleToId.get(dep)).filter(Boolean);
    }

    const taskList = tasks.map(t => t.task);
    const { valid, errors } = validateTaskDependencies(taskList);
    if (!valid) {
      console.warn('[Orchestrator] Dependency validation warnings:', errors);
      // Clean invalid deps rather than fail
      for (const task of taskList) {
        task.dependsOn = (task.dependsOn || []).filter(depId =>
          taskList.some(t => t.id === depId)
        );
      }
    }

    // Step 2: Execute via queue
    return this.runTasks(team, taskList);
  }

  /**
   * Execute explicit tasks with dependency resolution.
   * @param {Team} team
   * @param {Array} tasks - Array of task objects from createTask()
   * @returns {{ success, results, queue }}
   */
  async runTasks(team, tasks) {
    const queue = new TaskQueue();
    const results = new Map(); // taskId → result
    const semaphore = new Semaphore(this.maxConcurrency);

    queue.addBatch(tasks);

    // Execution loop
    while (true) {
      const pending = queue.getByStatus('pending');
      if (pending.length === 0) break;

      const dispatchPromises = pending.map(async (task) => {
        queue.update(task.id, { status: 'in_progress' });

        const assignee = task.assignee;
        const agent = assignee ? team.getAgent(assignee) : null;

        if (!agent) {
          queue.fail(task.id, `Agent "${assignee}" not found`);
          this.onProgress?.({ type: 'error', task: task.id, data: `Agent "${assignee}" not found` });
          return;
        }

        this.onProgress?.({ type: 'task_start', task: task.id, agent: assignee });

        // Build prompt with shared memory context
        const prompt = await this._buildTaskPrompt(task, team);

        await semaphore.run(async () => {
          const result = await executeWithRetry(
            () => agent.run(prompt),
            task,
            (retryData) => {
              this.onProgress?.({ type: 'task_retry', task: task.id, agent: assignee, data: retryData });
            },
          );

          results.set(task.id, result);

          if (result.success !== false) {
            // Write to shared memory
            await team.writeMemory(assignee, `task:${task.id}:result`, result.output || '');
            queue.complete(task.id, result.output || '');
            this.onProgress?.({ type: 'task_complete', task: task.id, agent: assignee });
          } else {
            queue.fail(task.id, result.output || 'Unknown error');
            this.onProgress?.({ type: 'error', task: task.id, agent: assignee, data: result.output });
          }
        });
      });

      await Promise.all(dispatchPromises);
    }

    const allComplete = queue.getAll().every(t => t.status === 'completed');
    return { success: allComplete, results, queue };
  }

  async _buildTaskPrompt(task, team) {
    const lines = [`# Task: ${task.title}`, '', task.description];

    const summary = await team.getMemorySummary();
    if (summary) lines.push('', summary);

    return lines.join('\n');
  }

  getStatus() {
    const teams = {};
    for (const [name, team] of this.teams) {
      teams[name] = { agents: team.getAgents().length, memoryKeys: team.sharedMemory.size };
    }
    return { teams, maxConcurrency: this.maxConcurrency };
  }

  shutdown() {
    this.teams.clear();
  }
}

module.exports = {
  Orchestrator,
  Team,
  parseTaskSpecs,
  executeWithRetry,
  computeRetryDelay,
};
