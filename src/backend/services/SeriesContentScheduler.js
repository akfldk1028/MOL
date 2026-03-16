/**
 * SeriesContentScheduler — Autonomous Series Episode Scheduler
 *
 * Pattern follows AgentLifecycle.js (start/stop, setInterval).
 *
 * tick() runs every 60 minutes:
 *   1. Find series with next_episode_at <= NOW() that are agent-authored + ongoing
 *   2. Skip if a pending/processing create_episode task already exists
 *   3. Create task via TaskScheduler
 *   4. Update next_episode_at to next scheduled day
 */

const { queryOne, queryAll } = require('../config/database');

const TICK_INTERVAL = 3_600_000; // 60 minutes

const DAY_MAP = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

class SeriesContentScheduler {
  static _interval = null;
  static _initialTimeout = null;
  static _started = false;
  static _stats = { startedAt: null, ticks: 0, tasksCreated: 0 };

  static start() {
    if (this._started) return;
    this._started = true;
    this._stats.startedAt = new Date();

    // Initial tick after 5 minutes (let other systems initialize)
    this._initialTimeout = setTimeout(() => {
      this._initialTimeout = null;
      this._tick().catch(err =>
        console.error('SeriesContentScheduler: initial tick error:', err.message)
      );
    }, 300_000);

    this._interval = setInterval(() => {
      this._tick().catch(err =>
        console.error('SeriesContentScheduler: tick error:', err.message)
      );
    }, TICK_INTERVAL);

    console.log('SeriesContentScheduler: started (60min interval)');
  }

  static stop() {
    if (this._initialTimeout) {
      clearTimeout(this._initialTimeout);
      this._initialTimeout = null;
    }
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._started = false;
    console.log('SeriesContentScheduler: stopped');
  }

  static getStatus() {
    return {
      started: this._started,
      stats: { ...this._stats },
    };
  }

  static async _tick() {
    this._stats.ticks++;

    // Find due autonomous series
    const dueSeries = await queryAll(
      `SELECT s.* FROM series s
       WHERE s.created_by_agent_id IS NOT NULL
         AND s.status = 'ongoing'
         AND s.next_episode_at IS NOT NULL
         AND s.next_episode_at <= NOW()`
    );

    if (dueSeries.length === 0) return;

    const TaskScheduler = require('./TaskScheduler');

    for (const series of dueSeries) {
      // Duplicate check: skip if create_episode task already pending/processing
      const existing = await queryOne(
        `SELECT id FROM agent_tasks
         WHERE target_id = $1 AND type = 'create_episode'
           AND status IN ('pending', 'processing')
         LIMIT 1`,
        [series.id]
      );
      if (existing) continue;

      // Create task — only advance next_episode_at on success
      try {
        await TaskScheduler.createTask({
          type: 'create_episode',
          agentId: series.created_by_agent_id,
          targetId: series.id,
          targetType: 'series',
          delayMinutes: 0,
          chainDepth: 0,
        });

        // Advance next_episode_at only after task creation succeeds
        const nextAt = this._calculateNextEpisodeAt(series.schedule_days, new Date());
        if (nextAt) {
          await queryOne(
            `UPDATE series SET next_episode_at = $1 WHERE id = $2`,
            [nextAt.toISOString(), series.id]
          );
        }

        this._stats.tasksCreated++;
        console.log(`SeriesContentScheduler: scheduled episode for "${series.title}" (next: ${nextAt?.toISOString() || 'none'})`);
      } catch (err) {
        console.error(`SeriesContentScheduler: failed to create task for "${series.title}":`, err.message);
        // next_episode_at NOT advanced — will retry on next tick
      }
    }
  }

  /**
   * Calculate next episode date from schedule_days array.
   * @param {string[]} scheduleDays - e.g. ['mon', 'thu']
   * @param {Date} fromDate - calculate from this date
   * @returns {Date|null}
   */
  static _calculateNextEpisodeAt(scheduleDays, fromDate) {
    if (!scheduleDays || scheduleDays.length === 0) return null;

    const targetDays = scheduleDays
      .map(d => DAY_MAP[d.toLowerCase()])
      .filter(d => d !== undefined)
      .sort((a, b) => a - b);

    if (targetDays.length === 0) return null;

    const now = new Date(fromDate);
    const currentDay = now.getDay(); // 0=Sun

    // Find next matching day (at least 1 day ahead)
    for (let offset = 1; offset <= 7; offset++) {
      const candidateDay = (currentDay + offset) % 7;
      if (targetDays.includes(candidateDay)) {
        const next = new Date(now);
        next.setDate(next.getDate() + offset);
        // Set to 10:00 KST (01:00 UTC) — morning publication
        next.setUTCHours(1, 0, 0, 0);
        return next;
      }
    }

    return null;
  }
}

module.exports = SeriesContentScheduler;
