/**
 * MemoryStore — In-process cache replacing Upstash Redis
 *
 * Stores: browsed posts, cooldowns, locks, counters
 * All data lives in process memory. DB backup via MemorySync.
 * TTL managed by periodic cleanup (every 5 min).
 */

const MAX_BROWSED_PER_AGENT = 500;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

class MemoryStore {
  constructor() {
    this._browsed = new Map();
    this._cooldowns = new Map();
    this._locks = new Map();
    this._counters = new Map();
    this._lastActive = new Map();
    this._dirtyBrowsed = new Set();
    this._dirtyCooldowns = new Set();
    this._startedAt = Date.now();
    this._syncCount = 0;
    this._lastSyncAt = null;
    this._cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  // ─── Browsed Posts ───

  hasBrowsed(agentId, postId) {
    const set = this._browsed.get(agentId);
    return set ? set.has(postId) : false;
  }

  addBrowsed(agentId, postId) {
    let set = this._browsed.get(agentId);
    if (!set) {
      set = new Set();
      this._browsed.set(agentId, set);
    }
    if (set.size >= MAX_BROWSED_PER_AGENT) {
      const oldest = set.values().next().value;
      set.delete(oldest);
    }
    set.add(postId);
    this._dirtyBrowsed.add(`${agentId}:${postId}`);
  }

  getBrowsedSet(agentId) {
    return this._browsed.get(agentId) || new Set();
  }

  getBrowsedCount(agentId) {
    const set = this._browsed.get(agentId);
    return set ? set.size : 0;
  }

  // ─── Cooldowns ───

  getCooldown(key) {
    const entry = this._cooldowns.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._cooldowns.delete(key);
      return null;
    }
    return entry.value;
  }

  setCooldown(key, value, ttlSeconds) {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this._cooldowns.set(key, { value: String(value), expiresAt });
    this._dirtyCooldowns.add(key);
  }

  // ─── Locks ───

  acquireLock(key, ttlSeconds) {
    const existing = this._locks.get(key);
    if (existing && Date.now() < existing) return false;
    this._locks.set(key, Date.now() + ttlSeconds * 1000);
    return true;
  }

  // ─── Counters ───

  incr(key, ttlSeconds) {
    let entry = this._counters.get(key);
    if (!entry || (entry.expiresAt && Date.now() > entry.expiresAt)) {
      entry = { count: 0, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null };
    }
    entry.count++;
    this._counters.set(key, entry);
    return entry.count;
  }

  getCounter(key) {
    const entry = this._counters.get(key);
    if (!entry) return 0;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._counters.delete(key);
      return 0;
    }
    return entry.count;
  }

  // ─── Last Active ───

  setLastActive(agentId) {
    this._lastActive.set(agentId, Date.now());
  }

  getLastActive(agentId) {
    return this._lastActive.get(agentId) || null;
  }

  // ─── Cleanup ───

  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this._cooldowns) {
      if (entry.expiresAt && now > entry.expiresAt) { this._cooldowns.delete(key); cleaned++; }
    }
    for (const [key, expiresAt] of this._locks) {
      if (now > expiresAt) { this._locks.delete(key); cleaned++; }
    }
    for (const [key, entry] of this._counters) {
      if (entry.expiresAt && now > entry.expiresAt) { this._counters.delete(key); cleaned++; }
    }
    if (cleaned > 0) console.log(`[MemoryStore] Cleaned ${cleaned} expired entries`);
  }

  // ─── Bulk Load ───

  loadBrowsed(agentId, postIds) {
    this._browsed.set(agentId, new Set(postIds));
  }

  loadCooldown(key, value, expiresAt) {
    if (expiresAt && Date.now() > expiresAt) return;
    this._cooldowns.set(key, { value, expiresAt });
  }

  // ─── Dirty Tracking ───

  getDirtyBrowsed() {
    const items = [...this._dirtyBrowsed];
    this._dirtyBrowsed.clear();
    return items;
  }

  getDirtyCooldowns() {
    const keys = [...this._dirtyCooldowns];
    this._dirtyCooldowns.clear();
    return keys;
  }

  markSynced() {
    this._syncCount++;
    this._lastSyncAt = Date.now();
  }

  // ─── Stats ───

  getStats() {
    let totalBrowsed = 0;
    for (const set of this._browsed.values()) totalBrowsed += set.size;
    return {
      totalAgents: this._browsed.size,
      totalBrowsedPosts: totalBrowsed,
      totalCooldowns: this._cooldowns.size,
      totalLocks: this._locks.size,
      totalCounters: this._counters.size,
      totalLastActive: this._lastActive.size,
      dirtyBrowsed: this._dirtyBrowsed.size,
      dirtyCooldowns: this._dirtyCooldowns.size,
      syncCount: this._syncCount,
      lastSyncAt: this._lastSyncAt ? new Date(this._lastSyncAt).toISOString() : null,
      memoryUsageMB: this.getMemoryUsageMB(),
      uptimeSeconds: Math.floor((Date.now() - this._startedAt) / 1000),
    };
  }

  getAgentState(agentId) {
    const browsedSet = this._browsed.get(agentId);
    const activeCooldowns = [];
    for (const [key, entry] of this._cooldowns) {
      if ((key.includes(agentId)) && (!entry.expiresAt || Date.now() < entry.expiresAt)) {
        activeCooldowns.push(key);
      }
    }
    return {
      agentId,
      browsedCount: browsedSet ? browsedSet.size : 0,
      activeCooldowns,
      lastActive: this._lastActive.get(agentId) || null,
    };
  }

  getMemoryUsageMB() {
    let bytes = 0;
    for (const set of this._browsed.values()) bytes += set.size * 50;
    bytes += this._cooldowns.size * 150;
    bytes += this._locks.size * 80;
    bytes += this._counters.size * 80;
    bytes += this._lastActive.size * 50;
    return +(bytes / 1024 / 1024).toFixed(2);
  }

  // ─── Reset ───

  resetAgent(agentId) {
    this._browsed.delete(agentId);
    this._lastActive.delete(agentId);
    for (const key of this._cooldowns.keys()) {
      if (key.includes(agentId)) this._cooldowns.delete(key);
    }
  }

  resetAll() {
    this._browsed.clear();
    this._cooldowns.clear();
    this._locks.clear();
    this._counters.clear();
    this._lastActive.clear();
    this._dirtyBrowsed.clear();
    this._dirtyCooldowns.clear();
  }

  destroy() {
    if (this._cleanupTimer) clearInterval(this._cleanupTimer);
  }
}

const store = new MemoryStore();
module.exports = store;
