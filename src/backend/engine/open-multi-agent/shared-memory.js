/**
 * SharedMemory — Namespaced KV store for team agent collaboration
 * @origin clone/open-multi-agent/src/memory/shared.ts (commit 607ba57)
 *
 * In-process memory with optional DB persistence via agent_shared_memory table.
 * Agents write under namespace `<agentName>/<key>`, any agent can read any entry.
 * getSummary() produces markdown for injecting into agent context (scratchpad pattern).
 *
 * DB schema (migration 019): agent_shared_memory(id, team_id, namespace, key, value, metadata, created_at, updated_at)
 */

const { queryOne, queryAll } = require('../../config/database');

class SharedMemory {
  /**
   * @param {object} [options]
   * @param {string} [options.teamId] - Team ID for DB persistence (optional)
   * @param {boolean} [options.persist] - Whether to persist to DB (default: false)
   */
  constructor(options = {}) {
    this.store = new Map(); // namespaced key → { value, agent, timestamp, metadata }
    this.teamId = options.teamId || null;
    this.persist = options.persist || false;
  }

  /** Namespaced key. */
  static namespaceKey(agentName, key) {
    return `${agentName}/${key}`;
  }

  /**
   * Write value under agent's namespace.
   * @param {string} agentName
   * @param {string} key
   * @param {string} value
   * @param {object} [metadata]
   */
  async write(agentName, key, value, metadata) {
    const nsKey = SharedMemory.namespaceKey(agentName, key);
    const entry = {
      value,
      agent: agentName,
      timestamp: new Date(),
      metadata: { ...metadata, agent: agentName },
    };
    this.store.set(nsKey, entry);

    // Optional DB persistence
    if (this.persist && this.teamId) {
      try {
        await queryOne(
          `INSERT INTO agent_shared_memory (team_id, namespace, key, value, metadata, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (team_id, namespace, key) DO UPDATE SET value = $4, metadata = $5, updated_at = NOW()`,
          [this.teamId, agentName, key, value, JSON.stringify(entry.metadata)]
        );
      } catch (err) {
        console.warn('[SharedMemory] DB write failed:', err.message);
      }
    }
  }

  /**
   * Read by full key or namespaced key.
   * @param {string} key - e.g. "outliner/events" or just a raw key
   * @returns {string|null}
   */
  async read(key) {
    const entry = this.store.get(key);
    if (entry) return entry.value;

    // Try DB fallback
    if (this.persist && this.teamId) {
      try {
        const parts = key.split('/');
        const namespace = parts.length > 1 ? parts[0] : null;
        const dbKey = parts.length > 1 ? parts.slice(1).join('/') : key;
        const row = await queryOne(
          `SELECT value FROM agent_shared_memory WHERE team_id = $1 AND namespace = $2 AND key = $3`,
          [this.teamId, namespace, dbKey]
        );
        return row?.value || null;
      } catch { return null; }
    }
    return null;
  }

  /** List all entries by agent. */
  async listByAgent(agentName) {
    const entries = [];
    const prefix = `${agentName}/`;
    for (const [key, entry] of this.store) {
      if (key.startsWith(prefix)) {
        entries.push({ key: key.slice(prefix.length), ...entry });
      }
    }
    return entries;
  }

  /** All entries. */
  async listAll() {
    return Array.from(this.store.entries()).map(([key, entry]) => ({ key, ...entry }));
  }

  /**
   * Generate markdown summary of all shared memory (scratchpad).
   * Suitable for injecting into agent prompts.
   */
  async getSummary() {
    if (this.store.size === 0) return null;

    const lines = ['## Shared Memory (Team Scratchpad)'];
    const byAgent = new Map();

    for (const [key, entry] of this.store) {
      const agent = entry.agent || 'unknown';
      if (!byAgent.has(agent)) byAgent.set(agent, []);
      const shortKey = key.includes('/') ? key.split('/').slice(1).join('/') : key;
      const preview = entry.value.length > 300 ? entry.value.slice(0, 300) + '...' : entry.value;
      byAgent.get(agent).push(`  - **${shortKey}**: ${preview}`);
    }

    for (const [agent, items] of byAgent) {
      lines.push(`\n### ${agent}`);
      lines.push(...items);
    }

    return lines.join('\n');
  }

  /** Load from DB on startup. */
  async loadFromDB() {
    if (!this.persist || !this.teamId) return;
    try {
      const rows = await queryAll(
        `SELECT namespace, key, value, metadata FROM agent_shared_memory WHERE team_id = $1`,
        [this.teamId]
      );
      for (const row of rows) {
        const nsKey = SharedMemory.namespaceKey(row.namespace, row.key);
        this.store.set(nsKey, {
          value: row.value,
          agent: row.namespace,
          timestamp: new Date(),
          metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        });
      }
    } catch (err) {
      console.warn('[SharedMemory] DB load failed:', err.message);
    }
  }

  /** Clear all. */
  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

module.exports = { SharedMemory };
