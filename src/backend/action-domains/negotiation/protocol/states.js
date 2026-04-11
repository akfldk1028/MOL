/**
 * states.js
 * ---------
 * Finite state machine for negotiation sessions.
 *
 *   OPEN
 *     │
 *     ▼ start()
 *   NEGOTIATING ──┬── ACCEPT  → CLOSED_DEAL
 *                 ├── WITHDRAW → CLOSED_NO_DEAL
 *                 ├── DEADLINE → CLOSED_NO_DEAL
 *                 └── DEADLOCK ─┐
 *                               ▼
 *                          DEADLOCKED ──┬── MEDIATOR → NEGOTIATING
 *                                       └── TIMEOUT → CLOSED_NO_DEAL
 */

const STATES = {
  OPEN: 'open',                     // session created, not started
  NEGOTIATING: 'negotiating',       // active exchange of proposals
  DEADLOCKED: 'deadlocked',         // no progress — needs mediator
  CLOSED_DEAL: 'closed_deal',       // successful deal
  CLOSED_NO_DEAL: 'closed_no_deal', // failed (withdraw, deadline, deadlock timeout)
  FAILED: 'failed',                 // error during execution
};

// Allowed transitions — any attempt outside this map throws
const TRANSITIONS = {
  [STATES.OPEN]: [STATES.NEGOTIATING, STATES.FAILED],
  [STATES.NEGOTIATING]: [
    STATES.DEADLOCKED,
    STATES.CLOSED_DEAL,
    STATES.CLOSED_NO_DEAL,
    STATES.FAILED,
  ],
  [STATES.DEADLOCKED]: [STATES.NEGOTIATING, STATES.CLOSED_NO_DEAL, STATES.FAILED],
  [STATES.CLOSED_DEAL]: [], // terminal
  [STATES.CLOSED_NO_DEAL]: [], // terminal
  [STATES.FAILED]: [], // terminal
};

function canTransition(from, to) {
  const allowed = TRANSITIONS[from] || [];
  return allowed.includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid state transition: ${from} → ${to}`);
  }
}

function isTerminal(state) {
  return [STATES.CLOSED_DEAL, STATES.CLOSED_NO_DEAL, STATES.FAILED].includes(state);
}

module.exports = {
  STATES,
  TRANSITIONS,
  canTransition,
  assertTransition,
  isTerminal,
};
