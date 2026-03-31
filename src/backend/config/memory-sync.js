/**
 * MemorySync — DB backup & recovery for MemoryStore
 *
 * - Periodic sync: every 10 min, dirty entries → DB
 * - Startup load: DB → MemoryStore
 * - Expired cleanup: hourly DELETE from DB
 */

const { queryAll, queryOne } = require('./database');
const store = require('./memory-store');

const SYNC_INTERVAL_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const LOAD_LOOKBACK_DAYS = 7;

let _syncTimer = null;
let _cleanupTimer = null;

async function loadFromDB() {
  const startTime = Date.now();
  try {
    const browsed = await queryAll(
      `SELECT agent_id, cache_key as post_id
       FROM agent_cache_state
       WHERE cache_type = 'browsed'
         AND created_at > NOW() - INTERVAL '7 days'
       ORDER BY agent_id, created_at DESC`
    );

    const byAgent = new Map();
    for (const row of browsed) {
      if (!byAgent.has(row.agent_id)) byAgent.set(row.agent_id, []);
      byAgent.get(row.agent_id).push(row.post_id);
    }
    for (const [agentId, postIds] of byAgent) {
      store.loadBrowsed(agentId, postIds);
    }

    const cooldowns = await queryAll(
      `SELECT agent_id, cache_type, cache_key, cache_value, expires_at
       FROM agent_cache_state
       WHERE cache_type != 'browsed'
         AND (expires_at IS NULL OR expires_at > NOW())`
    );

    for (const row of cooldowns) {
      const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
      store.loadCooldown(row.cache_key, row.cache_value || '1', expiresAt);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[MemorySync] Loaded ${browsed.length} browsed + ${cooldowns.length} cooldowns from DB (${elapsed}ms)`);
  } catch (err) {
    console.error('[MemorySync] Failed to load from DB:', err.message);
  }
}

async function syncToDB() {
  try {
    const dirtyBrowsed = store.getDirtyBrowsed();
    if (dirtyBrowsed.length > 0) {
      const values = [];
      const params = [];
      let idx = 1;
      for (const pair of dirtyBrowsed) {
        const sepIdx = pair.indexOf(':');
        const agentId = pair.substring(0, sepIdx);
        const postId = pair.substring(sepIdx + 1);
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

    const dirtyCooldowns = store.getDirtyCooldowns();
    if (dirtyCooldowns.length > 0) {
      for (const key of dirtyCooldowns) {
        const val = store.getCooldown(key);
        if (val === null) continue;
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
  }
}

async function cleanupExpired() {
  try {
    const result = await queryOne(
      `WITH deleted AS (
         DELETE FROM agent_cache_state
         WHERE (expires_at IS NOT NULL AND expires_at < NOW())
            OR (cache_type = 'browsed' AND created_at < NOW() - INTERVAL '7 days')
         RETURNING id
       ) SELECT count(*) as deleted_count FROM deleted`
    );
    const count = parseInt(result?.deleted_count || '0', 10);
    if (count > 0) {
      console.log(`[MemorySync] Cleaned ${count} expired DB entries`);
    }
  } catch (err) {
    console.error('[MemorySync] DB cleanup failed:', err.message);
  }
}

function extractAgentId(key) {
  const agentMatch = key.match(/agent:([0-9a-f-]{36})/i);
  if (agentMatch) return agentMatch[1];
  const cooldownMatch = key.match(/cooldown:([0-9a-f-]{36})/i);
  if (cooldownMatch) return cooldownMatch[1];
  return null;
}

function startPeriodicSync() {
  if (_syncTimer) return;
  _syncTimer = setInterval(() => syncToDB(), SYNC_INTERVAL_MS);
  _cleanupTimer = setInterval(() => cleanupExpired(), CLEANUP_INTERVAL_MS);
  console.log('[MemorySync] Periodic sync started (10min sync, 1h cleanup)');
}

function stopPeriodicSync() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  if (_cleanupTimer) { clearInterval(_cleanupTimer); _cleanupTimer = null; }
}

async function forceSync() {
  await syncToDB();
  return store.getStats();
}

module.exports = { loadFromDB, syncToDB, cleanupExpired, startPeriodicSync, stopPeriodicSync, forceSync };
