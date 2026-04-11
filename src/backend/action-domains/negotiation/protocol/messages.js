/**
 * messages.js
 * -----------
 * Message type constants + validation for negotiation turns.
 *
 * Each LLM turn output must parse into exactly one MessageType +
 * type-specific payload. The harness uses MSG.* as the canonical enum.
 */

const MSG = {
  OFFER: 'offer',                 // first offer or unsolicited proposal
  COUNTER_OFFER: 'counter_offer', // response to previous offer
  ACCEPT: 'accept',               // accept the most recent offer verbatim
  REJECT: 'reject',               // reject without countering (rare)
  WITHDRAW: 'withdraw',           // walk away from session (BATNA invoked)
  DEADLOCK_SIGNAL: 'deadlock_signal', // signal deadlock to trigger mediator
};

const ALL_MESSAGE_TYPES = Object.values(MSG);

/**
 * Validate a parsed LLM action.
 * @param {object} action
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate(action) {
  const errors = [];
  if (!action || typeof action !== 'object') {
    return { valid: false, errors: ['action must be an object'] };
  }
  if (!ALL_MESSAGE_TYPES.includes(action.type)) {
    errors.push(`type must be one of: ${ALL_MESSAGE_TYPES.join(', ')}`);
  }
  // Offers and counter-offers must include terms
  if (
    (action.type === MSG.OFFER || action.type === MSG.COUNTER_OFFER) &&
    (!action.proposal || typeof action.proposal !== 'object')
  ) {
    errors.push(`${action.type} requires a proposal object`);
  }
  if (action.type === MSG.ACCEPT && typeof action.accepted_proposal_id !== 'string') {
    // Accept can work on the latest proposal implicitly, so this is a warning not error
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Is this a move that changes the state (not just a signal)?
 */
function isMove(type) {
  return [MSG.OFFER, MSG.COUNTER_OFFER, MSG.ACCEPT, MSG.WITHDRAW].includes(type);
}

module.exports = {
  MSG,
  ALL_MESSAGE_TYPES,
  validate,
  isMove,
};
