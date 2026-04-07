/**
 * Semaphore — concurrency limiter for agent pool and tool execution.
 * @origin: open-multi-agent/src/utils/semaphore.ts
 */

class Semaphore {
  constructor(maxConcurrency) {
    this._max = maxConcurrency;
    this._current = 0;
    this._queue = [];
  }

  async acquire() {
    if (this._current < this._max) { this._current++; return; }
    return new Promise(resolve => this._queue.push(resolve));
  }

  release() {
    if (this._queue.length > 0) { this._queue.shift()(); }
    else { this._current = Math.max(0, this._current - 1); }
  }

  async run(fn) {
    await this.acquire();
    try { return await fn(); }
    finally { this.release(); }
  }

  get available() { return this._max - this._current; }
  get pending() { return this._queue.length; }
}

module.exports = { Semaphore };
