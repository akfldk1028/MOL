/**
 * session-base.js
 * ---------------
 * Common state-machine abstraction for action-domain sessions.
 *
 * All action-domain sessions (negotiation, data-analysis) share the same
 * lifecycle: created → running → closed/failed. Subclasses add domain-specific
 * state (Proposal[] for negotiation, Plan/Query[] for analysis).
 *
 * Key features:
 *   - Unique session id (UUID)
 *   - Turn log (append-only)
 *   - Deadline tracking (turn count or wall clock)
 *   - State transitions with validation
 *   - CGB-serializable snapshot (toJSON)
 */

const crypto = require('crypto');

const BASE_STATES = {
  OPEN: 'open',
  RUNNING: 'running',
  CLOSED: 'closed',
  FAILED: 'failed',
};

class SessionBase {
  /**
   * @param {object} params
   * @param {string} params.domain          - action-domain slug (e.g. 'negotiation')
   * @param {number} [params.deadlineTurns] - max turns before auto-close
   * @param {Date}   [params.deadlineAt]    - wall-clock deadline (alternative to turns)
   * @param {object} [params.metadata]      - free-form domain metadata
   */
  constructor({ domain, deadlineTurns = 20, deadlineAt = null, metadata = {} } = {}) {
    if (!domain) throw new Error('SessionBase: domain is required');

    this.id = crypto.randomUUID();
    this.domain = domain;
    this.state = BASE_STATES.OPEN;
    this.turns = []; // append-only log of { actor, action, payload, ts }
    this.deadlineTurns = deadlineTurns;
    this.deadlineAt = deadlineAt;
    this.metadata = metadata;
    this.startedAt = null;
    this.closedAt = null;
    this.result = null;
    this.error = null;
  }

  /**
   * Start the session. Must be in OPEN state.
   */
  start() {
    if (this.state !== BASE_STATES.OPEN) {
      throw new Error(`SessionBase.start: cannot start from state '${this.state}'`);
    }
    this.state = BASE_STATES.RUNNING;
    this.startedAt = new Date();
  }

  /**
   * Append a turn to the log. Subclasses should call this after each agent action.
   * @param {object} turn - { actor, action, payload, metadata? }
   */
  recordTurn(turn) {
    this.turns.push({
      ...turn,
      turn_number: this.turns.length + 1,
      ts: new Date().toISOString(),
    });
  }

  /**
   * Get the number of turns executed.
   */
  currentRound() {
    return this.turns.length;
  }

  /**
   * Turns remaining before deadline.
   */
  remainingTurns() {
    return Math.max(0, this.deadlineTurns - this.currentRound());
  }

  /**
   * Milliseconds remaining until wall-clock deadline (if set).
   */
  remainingTime() {
    if (!this.deadlineAt) return null;
    return Math.max(0, this.deadlineAt.getTime() - Date.now());
  }

  /**
   * Check whether deadline has been reached (either turn count or time).
   */
  isDeadlineReached() {
    if (this.remainingTurns() <= 0) return true;
    if (this.deadlineAt && this.remainingTime() <= 0) return true;
    return false;
  }

  /**
   * Transition to a new state. Subclasses can override to add validation.
   * @param {string} newState
   */
  transition(newState) {
    this.state = newState;
  }

  /**
   * Close the session with a result (success or failure).
   * @param {string} finalState - one of BASE_STATES (or subclass state)
   * @param {any}    result     - domain-specific result payload
   */
  close(finalState, result = null) {
    this.state = finalState;
    this.result = result;
    this.closedAt = new Date();
  }

  /**
   * Mark the session as failed with an error.
   */
  fail(error) {
    this.state = BASE_STATES.FAILED;
    this.error = error instanceof Error ? error.message : String(error);
    this.closedAt = new Date();
  }

  /**
   * Serializable snapshot for CGB / DB storage.
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      domain: this.domain,
      state: this.state,
      turns: this.turns,
      turn_count: this.turns.length,
      deadline_turns: this.deadlineTurns,
      deadline_at: this.deadlineAt ? this.deadlineAt.toISOString() : null,
      metadata: this.metadata,
      started_at: this.startedAt ? this.startedAt.toISOString() : null,
      closed_at: this.closedAt ? this.closedAt.toISOString() : null,
      result: this.result,
      error: this.error,
    };
  }

  /**
   * Re-hydrate a session from its JSON snapshot.
   * @param {object} snapshot
   */
  static fromJSON(snapshot, SessionClass = SessionBase) {
    const session = new SessionClass({
      domain: snapshot.domain,
      deadlineTurns: snapshot.deadline_turns,
      deadlineAt: snapshot.deadline_at ? new Date(snapshot.deadline_at) : null,
      metadata: snapshot.metadata,
    });
    session.id = snapshot.id;
    session.state = snapshot.state;
    session.turns = snapshot.turns || [];
    session.startedAt = snapshot.started_at ? new Date(snapshot.started_at) : null;
    session.closedAt = snapshot.closed_at ? new Date(snapshot.closed_at) : null;
    session.result = snapshot.result;
    session.error = snapshot.error;
    return session;
  }
}

module.exports = {
  SessionBase,
  BASE_STATES,
};
