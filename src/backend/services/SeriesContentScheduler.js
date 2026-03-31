/**
 * SeriesContentScheduler — Cron-based episode scheduler
 *
 * Checks every 30 minutes which series need new episodes based on schedule_cron.
 * Creates create_episode tasks via TaskScheduler.
 * MemoryStore lock prevents double-trigger.
 */

const { queryAll, queryOne } = require('../config/database');
const store = require('../config/memory-store');
const { parseExpression } = require('cron-parser');

const TICK_INTERVAL = 1_800_000; // 30 minutes

class SeriesContentScheduler {
  static _interval = null;
  static _started = false;
  static _stats = { startedAt: null, ticks: 0, tasksCreated: 0 };

  static start() {
    if (this._started) return;
    this._started = true;
    this._stats.startedAt = new Date();

    // Initial tick after 2 minutes
    setTimeout(() => {
      this._tick().catch(err => console.error('SeriesScheduler: initial tick error:', err.message));
    }, 120_000);

    this._interval = setInterval(() => {
      this._tick().catch(err => console.error('SeriesScheduler: tick error:', err.message));
    }, TICK_INTERVAL);

    console.log('SeriesScheduler: started (30min interval, cron-based)');
  }

  static stop() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
    this._started = false;
    console.log('SeriesScheduler: stopped');
  }

  static getStatus() {
    return { started: this._started, stats: { ...this._stats } };
  }

  static async _tick() {
    this._stats.ticks++;

    // Find ongoing series with schedule_cron OR legacy schedule_days
    const series = await queryAll(
      `SELECT s.id, s.slug, s.title, s.schedule_cron, s.schedule_days, s.created_by_agent_id, s.max_episodes, s.episode_count, s.next_episode_at
       FROM series s
       WHERE s.status = 'ongoing'
         AND s.created_by_agent_id IS NOT NULL
         AND (s.schedule_cron IS NOT NULL OR s.next_episode_at <= NOW())`
    );

    for (const s of series) {
      try {
        // Cron-based check
        if (s.schedule_cron && !this._shouldTrigger(s.schedule_cron)) continue;

        // Legacy: next_episode_at check (for series without schedule_cron)
        if (!s.schedule_cron && s.next_episode_at && new Date(s.next_episode_at) > new Date()) continue;

        // Check max_episodes
        if (s.max_episodes && s.episode_count >= s.max_episodes) continue;

        // Lock to prevent double-trigger
        const lockKey = `series:${s.id}:episode-lock`;
        if (!store.acquireLock(lockKey, 3600)) continue;

        // Check no pending create_episode task
        const pending = await queryOne(
          `SELECT 1 FROM agent_tasks WHERE target_id = $1 AND type = 'create_episode' AND status IN ('pending', 'processing') LIMIT 1`,
          [s.id]
        );
        if (pending) continue;

        // Create task
        const TaskScheduler = require('./TaskScheduler');
        await TaskScheduler.createTask({
          type: 'create_episode',
          agentId: s.created_by_agent_id,
          targetId: s.id,
          targetType: 'series',
        });

        this._stats.tasksCreated++;
        console.log(`SeriesScheduler: triggered episode for "${s.title}" (${s.slug})`);
      } catch (err) {
        console.error(`SeriesScheduler: error for "${s.title}":`, err.message);
      }
    }
  }

  /**
   * Check if a cron expression matches the current time (within 30min window)
   */
  static _shouldTrigger(cronExpr) {
    try {
      const interval = parseExpression(cronExpr, { utc: true });
      const prev = interval.prev().toDate();
      const now = new Date();
      const diffMs = now.getTime() - prev.getTime();
      return diffMs >= 0 && diffMs < TICK_INTERVAL;
    } catch {
      return false;
    }
  }
}

module.exports = SeriesContentScheduler;