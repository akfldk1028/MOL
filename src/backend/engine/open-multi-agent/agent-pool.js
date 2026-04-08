/**
 * AgentPool — Concurrency-controlled agent execution pool (ported from OMA agent/pool.ts)
 * @origin clone/open-multi-agent/src/agent/pool.ts (commit 607ba57)
 *
 * Registry + scheduler: holds named agents, enforces concurrency cap via Semaphore,
 * provides runParallel for fan-out and runAny for round-robin dispatch.
 */

const { Semaphore } = require('./semaphore');

class AgentPool {
  /**
   * @param {number} maxConcurrency - Max simultaneous agent runs
   */
  constructor(maxConcurrency = 5) {
    this.agents = new Map(); // name → agent { name, systemPrompt, run(prompt) }
    this.semaphore = new Semaphore(maxConcurrency);
    this._rrCursor = 0;
  }

  /** Register an agent. */
  add(agent) {
    if (!agent.name) throw new Error('AgentPool: agent must have a name');
    this.agents.set(agent.name, agent);
  }

  /** Get agent by name. */
  get(name) {
    return this.agents.get(name) || null;
  }

  /** Remove agent. */
  remove(name) {
    return this.agents.delete(name);
  }

  /** List all agent names. */
  list() {
    return Array.from(this.agents.keys());
  }

  /**
   * Run a specific agent with concurrency control.
   * @param {string} name - Agent name
   * @param {string} prompt - Prompt to send
   * @param {object} [options] - Extra options passed to agent.run()
   * @returns {Promise<{success, output}>}
   */
  async run(name, prompt, options) {
    const agent = this.agents.get(name);
    if (!agent) throw new Error(`AgentPool: agent "${name}" not found`);

    return this.semaphore.run(() => agent.run(prompt, options));
  }

  /**
   * Run multiple agents in parallel with concurrency control.
   * @param {Array<{agent: string, prompt: string}>} tasks
   * @returns {Promise<Map<string, {success, output}>>}
   */
  async runParallel(tasks) {
    const results = new Map();
    const promises = tasks.map(async ({ agent: name, prompt }) => {
      const result = await this.run(name, prompt);
      results.set(name, result);
    });
    await Promise.all(promises);
    return results;
  }

  /**
   * Run prompt on next agent (round-robin).
   * @param {string} prompt
   * @returns {Promise<{agent: string, result: {success, output}}>}
   */
  async runAny(prompt) {
    const names = this.list();
    if (names.length === 0) throw new Error('AgentPool: no agents registered');
    const name = names[this._rrCursor % names.length];
    this._rrCursor = (this._rrCursor + 1) % names.length;
    const result = await this.run(name, prompt);
    return { agent: name, result };
  }

  /** Pool status snapshot. */
  getStatus() {
    return {
      total: this.agents.size,
      agents: this.list(),
      concurrency: this.semaphore._max || 0,
    };
  }
}

module.exports = { AgentPool };
