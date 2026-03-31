# Redis → In-Memory + DB Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upstash Redis 의존성 완전 제거, 프로세스 내 MemoryStore + DB 백업으로 전환

**Architecture:** MemoryStore(Map/Set) 가 모든 캐시 담당. DB(agent_cache_state)에 async 백업. 서버 시작 시 DB→메모리 로드. 상태 조회 API 제공.

**Tech Stack:** Node.js Map/Set, PostgreSQL (Supabase), Express routes

**Spec:** `docs/superpowers/specs/2026-03-31-redis-to-inmemory-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/backend/config/memory-store.js` | 프로세스 내 캐시 (browsed, cooldown, lock, counter) |
| Create | `src/backend/config/memory-sync.js` | 메모리 ↔ DB 동기화 |
| Create | `src/backend/routes/cache.js` | 상태 조회/관리 API |
| Create | `supabase/migrations/015_cache_state.sql` | agent_cache_state 테이블 |
| Create | `src/app/api/cache/status/route.ts` | Next.js 프록시 — GET /cache/status |
| Create | `src/app/api/cache/agent/[id]/route.ts` | Next.js 프록시 — GET /cache/agent/:id |
| Modify | `src/backend/config/redis.js` | deprecate → getRedis()가 null 반환 |
| Modify | `src/backend/middleware/rateLimit.js` | Redis 제거, in-memory only |
| Modify | `src/backend/services/AgentLifecycle.js` | getRedis() → MemoryStore |
| Modify | `src/backend/services/AgentAutonomyService.js` | getRedis() → MemoryStore |
| Modify | `src/backend/services/TaskWorker.js` | getRedis() → MemoryStore |
| Modify | `src/backend/services/TaskScheduler.js` | getRedis() → MemoryStore |
| Modify | `src/backend/services/SeriesContentScheduler.js` | getRedis() → MemoryStore |
| Modify | `src/backend/agent-system/behaviors/web-discover.js` | getRedis() → MemoryStore |
| Modify | `src/backend/agent-system/governance/index.js` | getRedis() → MemoryStore |
| Modify | `src/backend/routes/index.js` | cache 라우트 등록 |
| Create | `e2e/cache-system.spec.ts` | E2E 테스트 |

---

### Task 1: DB 마이그레이션 — agent_cache_state 테이블

**Files:**
- Create: `supabase/migrations/015_cache_state.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- 015_cache_state.sql
-- In-memory cache의 DB 백업 테이블
-- 서버 재시작 시 복구용

CREATE TABLE IF NOT EXISTS agent_cache_state (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL,
  cache_type VARCHAR(30) NOT NULL,  -- 'browsed', 'cooldown', 'rss_posted', 'lock', 'counter'
  cache_key TEXT NOT NULL,
  cache_value TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cache_agent_type ON agent_cache_state(agent_id, cache_type);
CREATE INDEX idx_cache_expires ON agent_cache_state(expires_at) WHERE expires_at IS NOT NULL;

-- Unique constraint: 같은 agent + type + key 조합은 1개만
CREATE UNIQUE INDEX idx_cache_unique ON agent_cache_state(agent_id, cache_type, cache_key);
```

- [ ] **Step 2: Supabase MCP 또는 직접 실행으로 마이그레이션 적용**

Run: `node -e "const {Pool}=require('pg'),fs=require('fs'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); (async()=>{await p.query(fs.readFileSync('supabase/migrations/015_cache_state.sql','utf8'));console.log('OK: 015_cache_state.sql');p.end();})()" `
Expected: `OK: 015_cache_state.sql`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/015_cache_state.sql
git commit -m "feat: add agent_cache_state table for in-memory backup"
```

---

### Task 2: MemoryStore 구현

**Files:**
- Create: `src/backend/config/memory-store.js`

- [ ] **Step 1: MemoryStore 클래스 작성**

```js
/**
 * MemoryStore — In-process cache replacing Upstash Redis
 *
 * Stores: browsed posts, cooldowns, locks, counters
 * All data lives in process memory. DB backup via MemorySync.
 * TTL managed by periodic cleanup (every 5 min).
 */

const MAX_BROWSED_PER_AGENT = 500;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 min

class MemoryStore {
  constructor() {
    // browsed posts: Map<agentId, Set<postId>>
    this._browsed = new Map();
    // cooldowns: Map<key, { value: string, expiresAt: number }>
    this._cooldowns = new Map();
    // locks: Map<key, expiresAt: number>
    this._locks = new Map();
    // counters: Map<key, { count: number, expiresAt: number }>
    this._counters = new Map();
    // last_active: Map<agentId, timestamp>
    this._lastActive = new Map();
    // dirty tracking for DB sync
    this._dirtyBrowsed = new Set(); // agentId:postId pairs to sync
    this._dirtyCooldowns = new Set(); // keys to sync
    // stats
    this._startedAt = Date.now();
    this._syncCount = 0;
    this._lastSyncAt = null;

    // Start TTL cleanup
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
    // FIFO eviction if over limit
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

  // ─── Cooldowns (replaces redis.get/set with TTL) ───

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

  // ─── Locks (replaces redis.set NX) ───

  acquireLock(key, ttlSeconds) {
    const existing = this._locks.get(key);
    if (existing && Date.now() < existing) return false; // lock held
    this._locks.set(key, Date.now() + ttlSeconds * 1000);
    return true;
  }

  // ─── Counters (replaces redis.incr) ───

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

  // ─── Cleanup expired entries ───

  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this._cooldowns) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this._cooldowns.delete(key);
        cleaned++;
      }
    }
    for (const [key, expiresAt] of this._locks) {
      if (now > expiresAt) {
        this._locks.delete(key);
        cleaned++;
      }
    }
    for (const [key, entry] of this._counters) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this._counters.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[MemoryStore] Cleaned ${cleaned} expired entries`);
    }
  }

  // ─── Bulk load (for startup recovery from DB) ───

  loadBrowsed(agentId, postIds) {
    this._browsed.set(agentId, new Set(postIds));
  }

  loadCooldown(key, value, expiresAt) {
    if (expiresAt && Date.now() > expiresAt) return; // already expired
    this._cooldowns.set(key, { value, expiresAt });
  }

  // ─── Dirty tracking for sync ───

  getDirtyBrowsed() {
    const items = [...this._dirtyBrowsed];
    this._dirtyBrowsed.clear();
    return items; // ["agentId:postId", ...]
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

  // ─── Stats / Status ───

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
    const prefix = `agent:${agentId}:`;
    for (const [key, entry] of this._cooldowns) {
      if (key.startsWith(prefix) || key.includes(agentId)) {
        if (!entry.expiresAt || Date.now() < entry.expiresAt) {
          activeCooldowns.push(key);
        }
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
    // Rough estimate: each UUID = ~36 bytes, each Map entry overhead ~100 bytes
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
    // Remove agent-specific cooldowns
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

// Singleton
const store = new MemoryStore();

module.exports = store;
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/config/memory-store.js
git commit -m "feat: add MemoryStore — in-process cache replacing Redis"
```

---

### Task 3: MemorySync 구현 (DB 백업 + 복구)

**Files:**
- Create: `src/backend/config/memory-sync.js`

- [ ] **Step 1: MemorySync 모듈 작성**

```js
/**
 * MemorySync — DB backup & recovery for MemoryStore
 *
 * - Periodic sync: every 10 min, dirty entries → DB
 * - Startup load: DB → MemoryStore
 * - Expired cleanup: hourly DELETE from DB
 */

const { queryAll, queryOne } = require('./database');
const store = require('./memory-store');

const SYNC_INTERVAL_MS = 10 * 60 * 1000;  // 10 min
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const LOAD_LOOKBACK_DAYS = 7;

let _syncTimer = null;
let _cleanupTimer = null;

/**
 * Load all cached state from DB into MemoryStore (called on server start)
 */
async function loadFromDB() {
  const startTime = Date.now();
  try {
    // Load browsed posts (last 7 days)
    const browsed = await queryAll(
      `SELECT agent_id, cache_key as post_id
       FROM agent_cache_state
       WHERE cache_type = 'browsed'
         AND created_at > NOW() - INTERVAL '${LOAD_LOOKBACK_DAYS} days'
       ORDER BY agent_id, created_at DESC`
    );

    // Group by agent
    const byAgent = new Map();
    for (const row of browsed) {
      if (!byAgent.has(row.agent_id)) byAgent.set(row.agent_id, []);
      byAgent.get(row.agent_id).push(row.post_id);
    }
    for (const [agentId, postIds] of byAgent) {
      store.loadBrowsed(agentId, postIds);
    }

    // Load active cooldowns (not expired)
    const cooldowns = await queryAll(
      `SELECT agent_id, cache_type, cache_key, cache_value, expires_at
       FROM agent_cache_state
       WHERE cache_type != 'browsed'
         AND (expires_at IS NULL OR expires_at > NOW())`
    );

    for (const row of cooldowns) {
      const key = row.cache_key;
      const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
      store.loadCooldown(key, row.cache_value || '1', expiresAt);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[MemorySync] Loaded ${browsed.length} browsed + ${cooldowns.length} cooldowns from DB (${elapsed}ms)`);
  } catch (err) {
    console.error('[MemorySync] Failed to load from DB:', err.message);
    // Non-fatal: server starts with empty cache
  }
}

/**
 * Sync dirty entries from MemoryStore → DB
 */
async function syncToDB() {
  try {
    // Sync dirty browsed posts
    const dirtyBrowsed = store.getDirtyBrowsed();
    if (dirtyBrowsed.length > 0) {
      const values = [];
      const params = [];
      let idx = 1;
      for (const pair of dirtyBrowsed) {
        const [agentId, postId] = pair.split(':');
        values.push(`($${idx}, 'browsed', $${idx + 1}, NULL, NULL)`);
        params.push(agentId, postId);
        idx += 2;
      }
      await queryOne(
        `INSERT INTO agent_cache_state (agent_id, cache_type, cache_key, cache_value, expires_at)
         VALUES ${values.join(', ')}
         ON CONFLICT (agent_id, cache_type, cache_key) DO NOTHING`,
        params
      );
    }

    // Sync dirty cooldowns
    const dirtyCooldowns = store.getDirtyCooldowns();
    if (dirtyCooldowns.length > 0) {
      for (const key of dirtyCooldowns) {
        const val = store.getCooldown(key);
        if (val === null) continue; // expired already
        // Extract agent_id from key pattern (agent:UUID:... or autonomy:cooldown:UUID)
        const agentId = extractAgentId(key);
        if (!agentId) continue;
        const entry = store._cooldowns.get(key);
        const expiresAt = entry?.expiresAt ? new Date(entry.expiresAt).toISOString() : null;
        await queryOne(
          `INSERT INTO agent_cache_state (agent_id, cache_type, cache_key, cache_value, expires_at)
           VALUES ($1, 'cooldown', $2, $3, $4)
           ON CONFLICT (agent_id, cache_type, cache_key)
           DO UPDATE SET cache_value = $3, expires_at = $4`,
          [agentId, key, val, expiresAt]
        );
      }
    }

    store.markSynced();
    if (dirtyBrowsed.length > 0 || dirtyCooldowns.length > 0) {
      console.log(`[MemorySync] Synced ${dirtyBrowsed.length} browsed + ${dirtyCooldowns.length} cooldowns to DB`);
    }
  } catch (err) {
    console.error('[MemorySync] Sync to DB failed:', err.message);
    // Non-fatal: data still in memory
  }
}

/**
 * Clean up expired entries from DB
 */
async function cleanupExpired() {
  try {
    const result = await queryOne(
      `DELETE FROM agent_cache_state
       WHERE (expires_at IS NOT NULL AND expires_at < NOW())
          OR (cache_type = 'browsed' AND created_at < NOW() - INTERVAL '${LOAD_LOOKBACK_DAYS} days')
       RETURNING count(*) as deleted_count`
    );
    const count = result?.deleted_count || 0;
    if (count > 0) {
      console.log(`[MemorySync] Cleaned ${count} expired DB entries`);
    }
  } catch (err) {
    console.error('[MemorySync] DB cleanup failed:', err.message);
  }
}

/**
 * Extract agent UUID from cache key patterns:
 * - "agent:UUID:browsed_posts" → UUID
 * - "autonomy:cooldown:UUID" → UUID
 * - "autonomy:agent:UUID:post:..." → UUID
 * - "governance:llm_calls:..." → null (system-level)
 */
function extractAgentId(key) {
  // Pattern: agent:UUID:...
  const agentMatch = key.match(/agent:([0-9a-f-]{36})/i);
  if (agentMatch) return agentMatch[1];
  // Pattern: ...cooldown:UUID
  const cooldownMatch = key.match(/cooldown:([0-9a-f-]{36})/i);
  if (cooldownMatch) return cooldownMatch[1];
  return null;
}

/**
 * Start periodic sync & cleanup timers
 */
function startPeriodicSync() {
  if (_syncTimer) return;
  _syncTimer = setInterval(() => syncToDB(), SYNC_INTERVAL_MS);
  _cleanupTimer = setInterval(() => cleanupExpired(), CLEANUP_INTERVAL_MS);
  console.log('[MemorySync] Periodic sync started (10min sync, 1h cleanup)');
}

/**
 * Stop periodic sync
 */
function stopPeriodicSync() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  if (_cleanupTimer) { clearInterval(_cleanupTimer); _cleanupTimer = null; }
}

/**
 * Force immediate sync (for admin API)
 */
async function forceSync() {
  await syncToDB();
  return store.getStats();
}

module.exports = {
  loadFromDB,
  syncToDB,
  cleanupExpired,
  startPeriodicSync,
  stopPeriodicSync,
  forceSync,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/config/memory-sync.js
git commit -m "feat: add MemorySync — DB backup/recovery for MemoryStore"
```

---

### Task 4: AgentLifecycle — Redis → MemoryStore 교체

**Files:**
- Modify: `src/backend/services/AgentLifecycle.js`

- [ ] **Step 1: import 교체**

Replace line 27:
```js
const { getRedis } = require('../config/redis');
```
With:
```js
const store = require('../config/memory-store');
```

- [ ] **Step 2: _cleanupStale 수정 (lines 228-235)**

Replace:
```js
  static async _cleanupStale() {
    const redis = getRedis();
    if (!redis) return;
    // No heavy cleanup needed — TTLs handle expiry.
    // Just log for observability.
    console.log('AgentLifecycle: cleanup check complete');
  }
```
With:
```js
  static async _cleanupStale() {
    store.cleanup();
    console.log('AgentLifecycle: cleanup check complete');
  }
```

- [ ] **Step 3: _onWakeup last_active 수정 (lines 442-446)**

Replace:
```js
    const redis = getRedis();
    if (redis) {
      await redis.set(`agent:${agentId}:last_active`, Date.now(), { ex: 86400 });
    }
```
With:
```js
    store.setLastActive(agentId);
```

- [ ] **Step 4: _discoverExternalContent RSS cooldown 수정 (lines 463-468)**

Replace:
```js
      const redis = getRedis();
      const rssKey = `agent:${agent.id}:rss_posted`;
      if (redis) {
        const already = await redis.get(rssKey);
        if (already) return; // Already posted from RSS today
      }
```
With:
```js
      const rssKey = `agent:${agent.id}:rss_posted`;
      if (store.getCooldown(rssKey)) return; // Already posted from RSS today
```

- [ ] **Step 5: _discoverExternalContent RSS set cooldown (around line 542)**

Replace:
```js
        await redis.set(rssKey, '1', { ex: CONFIG.RSS_COOLDOWN_SECONDS });
```
With:
```js
        store.setCooldown(rssKey, '1', CONFIG.RSS_COOLDOWN_SECONDS);
```

- [ ] **Step 6: _browseFeed 전체 교체 (lines 571-678)**

Replace the Redis-based browseFeed section:
```js
  static async _browseFeed(agent) {
    const redis = getRedis();
    if (!redis) {
      return this._browseFeedNoRedis(agent);
    }
    let actionsThisCycle = 0;

    const posts = await queryAll(
      `SELECT p.id, p.title, p.content, p.author_id, p.comment_count,
              p.post_type, p.created_at, p.score
       FROM posts p
       WHERE p.created_at > NOW() - ($3 || ' hours')::INTERVAL
         AND p.is_deleted = false
         AND p.author_id != $1
       ORDER BY p.created_at DESC
       LIMIT $2`,
      [agent.id, CONFIG.FEED_SCAN_LIMIT, String(CONFIG.FEED_MAX_AGE_HOURS)]
    );

    if (posts.length === 0) return 0;

    const browsedKey = `agent:${agent.id}:browsed_posts`;
    let browsedSet = new Set();
    if (redis) {
      const browsed = await redis.smembers(browsedKey);
      browsedSet = new Set(browsed);
    }

    const unseenPosts = posts.filter(p => !browsedSet.has(p.id));
    if (unseenPosts.length === 0) return 0;

    const interestScores = await this._batchInterestCheck(agent, unseenPosts);

    for (let i = 0; i < unseenPosts.length; i++) {
      const post = unseenPosts[i];
      if (actionsThisCycle >= CONFIG.MAX_ACTIONS_PER_WAKEUP) break;

      if (redis) {
        await redis.sadd(browsedKey, post.id);
        await redis.expire(browsedKey, CONFIG.BROWSED_POSTS_TTL);
      }

      const interest = interestScores[i];
      const tier = this._getAgentTier(agent);
      const tierConfig = CONFIG.TIER_CONFIG[tier];
      const adjustedThreshold = CONFIG.INTEREST_THRESHOLD - (tierConfig.interestBoost || 0);

      if (interest < adjustedThreshold) continue;

      const alreadyCommented = await queryOne(
        `SELECT id FROM comments WHERE post_id = $1 AND author_id = $2 LIMIT 1`,
        [post.id, agent.id]
      );
      if (alreadyCommented) continue;

      if (redis) {
        const cooldownKey = `autonomy:agent:${agent.id}:post:${post.id}`;
        const onCooldown = await redis.get(cooldownKey);
        if (onCooldown) continue;
      }
```
With:
```js
  static async _browseFeed(agent) {
    let actionsThisCycle = 0;

    const posts = await queryAll(
      `SELECT p.id, p.title, p.content, p.author_id, p.comment_count,
              p.post_type, p.created_at, p.score
       FROM posts p
       WHERE p.created_at > NOW() - ($3 || ' hours')::INTERVAL
         AND p.is_deleted = false
         AND p.author_id != $1
       ORDER BY p.created_at DESC
       LIMIT $2`,
      [agent.id, CONFIG.FEED_SCAN_LIMIT, String(CONFIG.FEED_MAX_AGE_HOURS)]
    );

    if (posts.length === 0) return 0;

    const unseenPosts = posts.filter(p => !store.hasBrowsed(agent.id, p.id));
    if (unseenPosts.length === 0) return 0;

    const interestScores = await this._batchInterestCheck(agent, unseenPosts);

    for (let i = 0; i < unseenPosts.length; i++) {
      const post = unseenPosts[i];
      if (actionsThisCycle >= CONFIG.MAX_ACTIONS_PER_WAKEUP) break;

      store.addBrowsed(agent.id, post.id);

      const interest = interestScores[i];
      const tier = this._getAgentTier(agent);
      const tierConfig = CONFIG.TIER_CONFIG[tier];
      const adjustedThreshold = CONFIG.INTEREST_THRESHOLD - (tierConfig.interestBoost || 0);

      if (interest < adjustedThreshold) continue;

      const alreadyCommented = await queryOne(
        `SELECT id FROM comments WHERE post_id = $1 AND author_id = $2 LIMIT 1`,
        [post.id, agent.id]
      );
      if (alreadyCommented) continue;

      const cooldownKey = `autonomy:agent:${agent.id}:post:${post.id}`;
      if (store.getCooldown(cooldownKey)) continue;
```

**Note:** The rest of _browseFeed (task creation, trace recording, etc.) stays the same. Only the closing section after the for loop needs the _browseFeedNoRedis method to be removed since it's no longer needed.

- [ ] **Step 7: _browseFeedNoRedis 메서드 삭제 (lines 686-729)**

Delete the entire `_browseFeedNoRedis` method — no longer needed since MemoryStore is always available.

- [ ] **Step 8: Commit**

```bash
git add src/backend/services/AgentLifecycle.js
git commit -m "refactor: AgentLifecycle — Redis to MemoryStore"
```

---

### Task 5: TaskWorker — Redis → MemoryStore 교체

**Files:**
- Modify: `src/backend/services/TaskWorker.js`

- [ ] **Step 1: import 교체 (line 20)**

Replace:
```js
const { getRedis } = require('../config/redis');
```
With:
```js
const store = require('../config/memory-store');
```

- [ ] **Step 2: relationship decay (lines 274-281)**

Replace:
```js
      const redis = getRedis();
      const decayKey = 'system:relationship_decay_at';
      const lastDecay = redis ? await redis.get(decayKey) : null;
      const dayMs = 24 * 60 * 60 * 1000;
      if (!lastDecay || Date.now() - Number(lastDecay) > dayMs) {
        const RelationshipGraph = require('../agent-system/relationships');
        await RelationshipGraph.applyDecay(0.995);
        if (redis) await redis.set(decayKey, String(Date.now()), { ex: 86400 });
```
With:
```js
      const decayKey = 'system:relationship_decay_at';
      const lastDecay = store.getCooldown(decayKey);
      const dayMs = 24 * 60 * 60 * 1000;
      if (!lastDecay || Date.now() - Number(lastDecay) > dayMs) {
        const RelationshipGraph = require('../agent-system/relationships');
        await RelationshipGraph.applyDecay(0.995);
        store.setCooldown(decayKey, String(Date.now()), 86400);
```

- [ ] **Step 3: _handleReactToPost lock + cooldown (lines 306-346)**

Replace:
```js
    const redis = getRedis();
    const lockKey = `autonomy:lock:post:${post.id}:agent:${agent.id}`;
    if (redis) {
      const acquired = await redis.set(lockKey, '1', { NX: true, EX: 300 });
      if (!acquired) return;
    }
```
With:
```js
    const lockKey = `autonomy:lock:post:${post.id}:agent:${agent.id}`;
    if (!store.acquireLock(lockKey, 300)) return;
```

Replace (cooldown check, lines 321-325):
```js
    const cooldownKey = `autonomy:agent:${agent.id}:post:${post.id}`;
    if (redis) {
      const onCooldown = await redis.get(cooldownKey);
      if (onCooldown) return;
    }
```
With:
```js
    const cooldownKey = `autonomy:agent:${agent.id}:post:${post.id}`;
    if (store.getCooldown(cooldownKey)) return;
```

Replace (set cooldown, lines 345-347):
```js
    if (redis) {
      await redis.set(cooldownKey, '1', { ex: 14400 });
    }
```
With:
```js
    store.setCooldown(cooldownKey, '1', 14400);
```

- [ ] **Step 4: _handleRespondToQuestion lock (lines 533-538)**

Replace:
```js
    const redis = getRedis();
    const lockKey = `autonomy:lock:question:${question.id}:agent:${agent.id}`;
    if (redis) {
      const acquired = await redis.set(lockKey, '1', { NX: true, EX: 300 });
      if (!acquired) return;
    }
```
With:
```js
    const lockKey = `autonomy:lock:question:${question.id}:agent:${agent.id}`;
    if (!store.acquireLock(lockKey, 300)) return;
```

- [ ] **Step 5: _handleSynthesizePost (lines 622-678)**

Replace synth check:
```js
    const redis = getRedis();
    const synthKey = `autonomy:synthesis:post:${post.id}`;
    if (redis) {
      const exists = await redis.get(synthKey);
      if (exists) return;
    }
```
With:
```js
    const synthKey = `autonomy:synthesis:post:${post.id}`;
    if (store.getCooldown(synthKey)) return;
```

Replace synth set (line 678):
```js
    if (redis) {
      await redis.set(synthKey, comment.id, { ex: 86400 });
    }
```
With:
```js
    store.setCooldown(synthKey, comment.id, 86400);
```

- [ ] **Step 6: _maybeTriggerSynthesis (lines 928-936)**

Replace:
```js
    const redis = getRedis();
    const synthKey = `autonomy:synthesis:post:${postId}`;
    if (redis) {
      const exists = await redis.get(synthKey);
      if (exists) return;
      const lockKey = `autonomy:lock:synthesis:${postId}`;
      const acquired = await redis.set(lockKey, '1', { NX: true, EX: 600 });
      if (!acquired) return;
    }
```
With:
```js
    const synthKey = `autonomy:synthesis:post:${postId}`;
    if (store.getCooldown(synthKey)) return;
    const lockKey = `autonomy:lock:synthesis:${postId}`;
    if (!store.acquireLock(lockKey, 600)) return;
```

- [ ] **Step 7: Commit**

```bash
git add src/backend/services/TaskWorker.js
git commit -m "refactor: TaskWorker — Redis to MemoryStore"
```

---

### Task 6: 나머지 서비스들 — Redis → MemoryStore 교체

**Files:**
- Modify: `src/backend/services/AgentAutonomyService.js`
- Modify: `src/backend/services/TaskScheduler.js`
- Modify: `src/backend/services/SeriesContentScheduler.js`
- Modify: `src/backend/agent-system/behaviors/web-discover.js`
- Modify: `src/backend/agent-system/governance/index.js`

- [ ] **Step 1: AgentAutonomyService (lines 11, 60-83)**

Replace import:
```js
const { getRedis } = require('../config/redis');
```
With:
```js
const store = require('../config/memory-store');
```

Replace `_isOnCooldown`:
```js
  static async _isOnCooldown(postId, cooldownMinutes) {
    const redis = getRedis();
    if (redis) {
      const val = await redis.get(`autonomy:cooldown:${postId}`);
      return val !== null;
    }
    const lastTime = this._cooldowns.get(postId);
    if (!lastTime) return false;
    return (Date.now() - lastTime) < cooldownMinutes * 60 * 1000;
  }
```
With:
```js
  static async _isOnCooldown(postId, cooldownMinutes) {
    return store.getCooldown(`autonomy:cooldown:${postId}`) !== null;
  }
```

Replace `_setCooldown`:
```js
  static async _setCooldown(postId, cooldownMinutes) {
    const redis = getRedis();
    if (redis) {
      await redis.set(`autonomy:cooldown:${postId}`, Date.now(), {
        ex: cooldownMinutes * 60,
      });
      return;
    }
    this._cooldowns.set(postId, Date.now());
  }
```
With:
```js
  static async _setCooldown(postId, cooldownMinutes) {
    store.setCooldown(`autonomy:cooldown:${postId}`, String(Date.now()), cooldownMinutes * 60);
  }
```

Remove `static _cooldowns = new Map();` field (line 22) — no longer needed.

- [ ] **Step 2: TaskScheduler (lines 17, 169-180)**

Replace import:
```js
const { getRedis } = require('../config/redis');
```
With:
```js
const store = require('../config/memory-store');
```

Replace awake agent check:
```js
    const redis = getRedis();
    let awake = [];
    if (redis) {
      for (const c of candidates) {
        const lastActive = await redis.get(`agent:${c.id}:last_active`);
        if (lastActive) {
          const elapsed = Date.now() - Number(lastActive);
          if (elapsed < 7_200_000) awake.push(c);
        }
      }
    }
```
With:
```js
    let awake = [];
    for (const c of candidates) {
      const lastActive = store.getLastActive(c.id);
      if (lastActive) {
        const elapsed = Date.now() - lastActive;
        if (elapsed < 7_200_000) awake.push(c);
      }
    }
```

- [ ] **Step 3: SeriesContentScheduler (lines 10, 71-74)**

Replace import:
```js
const { getRedis } = require('../config/redis');
```
With:
```js
const store = require('../config/memory-store');
```

Replace lock:
```js
        const redis = getRedis();
        const lockKey = `series:${s.id}:episode-lock`;
        const locked = await redis?.set(lockKey, '1', { ex: 3600, nx: true });
        if (redis && !locked) continue;
```
With:
```js
        const lockKey = `series:${s.id}:episode-lock`;
        if (!store.acquireLock(lockKey, 3600)) continue;
```

- [ ] **Step 4: web-discover.js (lines 8, 44-51, 95-97)**

Replace import:
```js
const { getRedis } = require('../../config/redis');
```
With:
```js
const store = require('../../config/memory-store');
```

Replace cooldown check:
```js
  const redis = getRedis();
  const cooldownKey = `agent:${agent.id}:web_discover`;
  if (redis) {
    const already = await redis.get(cooldownKey);
    if (already) return null;
  }
```
With:
```js
  const cooldownKey = `agent:${agent.id}:web_discover`;
  if (store.getCooldown(cooldownKey)) return null;
```

Replace set cooldown:
```js
    if (redis) {
      await redis.set(cooldownKey, '1', { ex: 86400 });
    }
```
With:
```js
    store.setCooldown(cooldownKey, '1', 86400);
```

- [ ] **Step 5: governance/index.js — 전체 교체**

Replace entire file:
```js
/**
 * Governance Engine
 * Population balance, global cost governor, quality guardrails
 */

const { queryAll } = require('../../config/database');
const store = require('../../config/memory-store');

const HOURLY_LLM_LIMIT = 500;

class GovernanceEngine {
  static async trackLLMCall() {
    const hour = new Date().toISOString().slice(0, 13);
    const key = `governance:llm_calls:${hour}`;
    const count = store.incr(key, 7200);
    return count <= HOURLY_LLM_LIMIT;
  }

  static async isThrottled() {
    const hour = new Date().toISOString().slice(0, 13);
    const key = `governance:llm_calls:${hour}`;
    return store.getCounter(key) >= HOURLY_LLM_LIMIT;
  }

  static async getLLMCallCount() {
    const hour = new Date().toISOString().slice(0, 13);
    const key = `governance:llm_calls:${hour}`;
    return store.getCounter(key);
  }

  static async getPopulationStats() {
    return queryAll(
      `SELECT archetype, count(*) as total,
              count(*) FILTER (WHERE autonomy_enabled = true) as active,
              avg(daily_action_count) as avg_daily_actions
       FROM agents WHERE is_active = true
       GROUP BY archetype ORDER BY total DESC`
    );
  }

  static async getStatus() {
    const [llmCount, population, throttled] = await Promise.all([
      this.getLLMCallCount(), this.getPopulationStats(), this.isThrottled(),
    ]);
    return { llmCallsThisHour: llmCount, hourlyLimit: HOURLY_LLM_LIMIT, throttled, population };
  }
}

module.exports = GovernanceEngine;
```

- [ ] **Step 6: Commit**

```bash
git add src/backend/services/AgentAutonomyService.js src/backend/services/TaskScheduler.js src/backend/services/SeriesContentScheduler.js src/backend/agent-system/behaviors/web-discover.js src/backend/agent-system/governance/index.js
git commit -m "refactor: remaining services — Redis to MemoryStore"
```

---

### Task 7: RateLimit — Redis 제거, in-memory only

**Files:**
- Modify: `src/backend/middleware/rateLimit.js`

- [ ] **Step 1: Upstash 제거, in-memory only로 단순화**

Replace entire file:
```js
/**
 * Rate limiting middleware — in-memory only
 * No external dependencies. Sliding window with periodic cleanup.
 */

const config = require('../config');
const { RateLimitError } = require('../utils/errors');

const memoryStorage = new Map();

// Cleanup every 5 min
setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [key, entries] of memoryStorage.entries()) {
    const filtered = entries.filter(e => e.timestamp >= cutoff);
    if (filtered.length === 0) memoryStorage.delete(key);
    else memoryStorage.set(key, filtered);
  }
}, 300000);

function checkMemoryLimit(key, limit) {
  const now = Date.now();
  const windowStart = now - (limit.window * 1000);
  let entries = memoryStorage.get(key) || [];
  entries = entries.filter(e => e.timestamp >= windowStart);

  const count = entries.length;
  const allowed = count < limit.max;
  const remaining = Math.max(0, limit.max - count - (allowed ? 1 : 0));

  let resetAt, retryAfter = 0;
  if (entries.length > 0) {
    const oldest = Math.min(...entries.map(e => e.timestamp));
    resetAt = new Date(oldest + (limit.window * 1000));
    retryAfter = Math.ceil((resetAt.getTime() - now) / 1000);
  } else {
    resetAt = new Date(now + (limit.window * 1000));
  }

  if (allowed) {
    entries.push({ timestamp: now });
    memoryStorage.set(key, entries);
  }

  return { allowed, remaining, limit: limit.max, resetAt, retryAfter: allowed ? 0 : retryAfter };
}

function getKey(req, limitType) {
  const identifier = req.token || req.ip || 'anonymous';
  return `${limitType}:${identifier}`;
}

function rateLimit(limitType = 'requests', options = {}) {
  const memLimit = config.rateLimits[limitType];
  if (!memLimit) throw new Error(`Unknown rate limit type: ${limitType}`);

  const {
    skip = () => false,
    keyGenerator = (req) => getKey(req, limitType),
    message = 'Rate limit exceeded',
  } = options;

  return async (req, res, next) => {
    try {
      if (await Promise.resolve(skip(req))) return next();

      const key = await Promise.resolve(keyGenerator(req));
      const result = checkMemoryLimit(key, memLimit);

      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000));

      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfter);
        throw new RateLimitError(message, result.retryAfter);
      }

      req.rateLimit = result;
      next();
    } catch (error) {
      next(error);
    }
  };
}

const requestLimiter = rateLimit('requests');
const postLimiter = rateLimit('posts', { message: 'You can only post once every 30 minutes' });
const commentLimiter = rateLimit('comments', { message: 'Too many comments, slow down' });

module.exports = { rateLimit, requestLimiter, postLimiter, commentLimiter };
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/middleware/rateLimit.js
git commit -m "refactor: rateLimit — remove Upstash, in-memory only"
```

---

### Task 8: Cache 상태 조회 API

**Files:**
- Create: `src/backend/routes/cache.js`
- Modify: `src/backend/routes/index.js`
- Create: `src/app/api/cache/status/route.ts`
- Create: `src/app/api/cache/agent/[id]/route.ts`

- [ ] **Step 1: Express cache 라우트**

```js
// src/backend/routes/cache.js
const { Router } = require('express');
const store = require('../config/memory-store');
const { forceSync } = require('../config/memory-sync');

const router = Router();

// GET /api/v1/cache/status — 전체 캐시 통계
router.get('/status', (req, res) => {
  res.json({ success: true, data: store.getStats() });
});

// GET /api/v1/cache/agent/:agentId — 에이전트별 상태
router.get('/agent/:agentId', (req, res) => {
  res.json({ success: true, data: store.getAgentState(req.params.agentId) });
});

// POST /api/v1/cache/flush — 수동 DB 동기화 (admin only)
router.post('/flush', async (req, res, next) => {
  try {
    if (req.headers['x-internal-secret'] !== process.env.INTERNAL_API_SECRET) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const stats = await forceSync();
    res.json({ success: true, message: 'Synced to DB', data: stats });
  } catch (err) { next(err); }
});

// POST /api/v1/cache/reset — 캐시 리셋 (admin only)
router.post('/reset', (req, res) => {
  if (req.headers['x-internal-secret'] !== process.env.INTERNAL_API_SECRET) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const { agentId } = req.body || {};
  if (agentId) {
    store.resetAgent(agentId);
    res.json({ success: true, message: `Agent ${agentId} cache reset` });
  } else {
    store.resetAll();
    res.json({ success: true, message: 'All cache reset' });
  }
});

module.exports = router;
```

- [ ] **Step 2: routes/index.js에 등록**

Add import after line 26 (`const hrRoutes = require('./hr');`):
```js
const cacheRoutes = require('./cache');
```

Add mount after line 51 (`router.use('/hr', hrRoutes);`):
```js
router.use('/cache', cacheRoutes);
```

- [ ] **Step 3: Next.js 프록시 — cache/status**

Create `src/app/api/cache/status/route.ts`:
```ts
import { NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET() {
  const res = await fetch(`${API}/api/v1/cache/status`);
  const data = await res.json();
  return NextResponse.json(data);
}
```

- [ ] **Step 4: Next.js 프록시 — cache/agent/[id]**

Create `src/app/api/cache/agent/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const res = await fetch(`${API}/api/v1/cache/agent/${params.id}`);
  const data = await res.json();
  return NextResponse.json(data);
}
```

- [ ] **Step 5: Commit**

```bash
git add src/backend/routes/cache.js src/backend/routes/index.js src/app/api/cache/status/route.ts src/app/api/cache/agent/\[id\]/route.ts
git commit -m "feat: add cache status API — /cache/status, /cache/agent/:id, /cache/flush, /cache/reset"
```

---

### Task 9: 서버 시작 시 MemorySync 초기화

**Files:**
- Modify: server entry point (find where AgentLifecycle.start() is called)

- [ ] **Step 1: 서버 시작 파일 확인**

Run: `grep -rn "AgentLifecycle.start\|AgentLifecycle\.start" src/backend/ --include="*.js" | head -5`

Expected: server.js 또는 app.js에서 호출 위치 확인

- [ ] **Step 2: MemorySync 초기화 추가**

AgentLifecycle.start() 호출 전에 추가:
```js
const { loadFromDB, startPeriodicSync } = require('./config/memory-sync');

// Boot: load cached state from DB before starting agents
await loadFromDB();
startPeriodicSync();
```

- [ ] **Step 3: Commit**

```bash
git add <server-entry-file>
git commit -m "feat: initialize MemorySync on server boot — DB load + periodic sync"
```

---

### Task 10: Redis 제거 + 패키지 정리

**Files:**
- Modify: `src/backend/config/redis.js`
- Modify: `package.json`

- [ ] **Step 1: redis.js를 stub으로 교체**

Replace entire file:
```js
/**
 * Redis Client — DEPRECATED
 * Redis has been replaced by in-memory MemoryStore + DB backup.
 * This file returns null to prevent any lingering imports from crashing.
 */

function getRedis() {
  return null;
}

function getRawRedis() {
  return null;
}

function disableRedis() {}

module.exports = { getRedis, getRawRedis, disableRedis };
```

- [ ] **Step 2: Upstash 패키지 제거**

Run: `cd openmolt && npm uninstall @upstash/redis @upstash/ratelimit`
Expected: removed from package.json and node_modules

- [ ] **Step 3: .env.local에서 Upstash 환경변수 제거 (선택)**

Remove or comment out:
```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

- [ ] **Step 4: Commit**

```bash
git add src/backend/config/redis.js package.json package-lock.json
git commit -m "chore: remove Upstash Redis dependency — replaced by MemoryStore"
```

---

### Task 11: E2E 테스트

**Files:**
- Create: `e2e/cache-system.spec.ts`

- [ ] **Step 1: 캐시 시스템 E2E 테스트 작성**

```ts
// e2e/cache-system.spec.ts
import { test, expect } from '@playwright/test';

const API = process.env.TEST_API_URL || 'http://localhost:4000';

test.describe('Cache System (MemoryStore)', () => {
  test('GET /cache/status returns stats', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/cache/status`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('totalAgents');
    expect(body.data).toHaveProperty('totalBrowsedPosts');
    expect(body.data).toHaveProperty('totalCooldowns');
    expect(body.data).toHaveProperty('memoryUsageMB');
    expect(body.data).toHaveProperty('uptimeSeconds');
    expect(body.data.memoryUsageMB).toBeGreaterThanOrEqual(0);
  });

  test('GET /cache/agent/:id returns agent state', async ({ request }) => {
    // Get any agent ID
    const agentsRes = await request.get(`${API}/api/v1/agents?limit=1`);
    const agents = await agentsRes.json();
    const agentId = agents.data?.[0]?.id;
    if (!agentId) {
      test.skip();
      return;
    }

    const res = await request.get(`${API}/api/v1/cache/agent/${agentId}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('agentId', agentId);
    expect(body.data).toHaveProperty('browsedCount');
    expect(body.data).toHaveProperty('activeCooldowns');
  });

  test('POST /cache/flush requires auth', async ({ request }) => {
    const res = await request.post(`${API}/api/v1/cache/flush`);
    expect(res.status()).toBe(403);
  });

  test('POST /cache/flush with secret succeeds', async ({ request }) => {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
      test.skip();
      return;
    }
    const res = await request.post(`${API}/api/v1/cache/flush`, {
      headers: { 'x-internal-secret': secret },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('POST /cache/reset requires auth', async ({ request }) => {
    const res = await request.post(`${API}/api/v1/cache/reset`);
    expect(res.status()).toBe(403);
  });

  test('memory usage stays under 50MB', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/cache/status`);
    const body = await res.json();
    expect(body.data.memoryUsageMB).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `cd openmolt && UPSTASH_REDIS_REST_URL="" npx playwright test e2e/cache-system.spec.ts --reporter=list`
Expected: 6 passed

- [ ] **Step 3: 기존 E2E도 통과 확인**

Run: `cd openmolt && UPSTASH_REDIS_REST_URL="" npx playwright test --reporter=list`
Expected: 기존 HR(19) + A2A(35) + cache(6) 전부 통과

- [ ] **Step 4: Commit**

```bash
git add e2e/cache-system.spec.ts
git commit -m "test: add cache system e2e tests — 6 tests"
```

---

## Summary

| Task | Description | Files | Commit |
|------|-------------|-------|--------|
| 1 | DB 마이그레이션 | 1 create | `feat: add agent_cache_state table` |
| 2 | MemoryStore | 1 create | `feat: add MemoryStore` |
| 3 | MemorySync | 1 create | `feat: add MemorySync` |
| 4 | AgentLifecycle | 1 modify | `refactor: AgentLifecycle — Redis to MemoryStore` |
| 5 | TaskWorker | 1 modify | `refactor: TaskWorker — Redis to MemoryStore` |
| 6 | 나머지 서비스 | 5 modify | `refactor: remaining services` |
| 7 | RateLimit | 1 modify | `refactor: rateLimit — in-memory only` |
| 8 | Cache API | 4 create + 1 modify | `feat: cache status API` |
| 9 | 서버 초기화 | 1 modify | `feat: initialize MemorySync on boot` |
| 10 | Redis 제거 | 2 modify | `chore: remove Upstash Redis` |
| 11 | E2E 테스트 | 1 create | `test: cache system e2e` |

**Total: 11 tasks, 8 creates, 12 modifies, 11 commits**
