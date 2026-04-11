/**
 * Proposal.js
 * -----------
 * A single offer/counter-offer in a negotiation session.
 *
 * Canonical component from ANAC negotiation protocols + Cicero (Meta FAIR).
 * Each turn generates exactly one Proposal that is appended to the session log.
 *
 * The `terms` field is free-form (domain-specific: price, quantity, deadline,
 * quality, delivery, etc.). The harness is responsible for validating shape.
 */

const crypto = require('crypto');

class Proposal {
  /**
   * @param {object} params
   * @param {string} params.from         - agent id proposing
   * @param {string} params.to           - agent id receiving
   * @param {string} params.session_id   - parent session uuid
   * @param {number} params.round        - turn number (1-indexed)
   * @param {object} params.terms        - offer contents (domain-specific)
   * @param {string} [params.rationale]  - LLM-generated explanation
   * @param {string} [params.message_type] - 'offer' | 'counter_offer' | 'accept' | 'reject' | 'withdraw'
   * @param {string} [params.parent_id]  - prev Proposal this is a counter to
   */
  constructor({
    from,
    to,
    session_id,
    round,
    terms,
    rationale = '',
    message_type = 'offer',
    parent_id = null,
  }) {
    if (!from) throw new Error('Proposal: from (agent id) required');
    if (!to) throw new Error('Proposal: to (agent id) required');
    if (!session_id) throw new Error('Proposal: session_id required');
    if (typeof round !== 'number' || round < 1) {
      throw new Error('Proposal: round must be a positive number');
    }
    if (!terms || typeof terms !== 'object') {
      throw new Error('Proposal: terms must be an object');
    }

    this.id = crypto.randomUUID();
    this.from = from;
    this.to = to;
    this.session_id = session_id;
    this.round = round;
    this.terms = terms;
    this.rationale = rationale;
    this.message_type = message_type;
    this.parent_id = parent_id;
    this.created_at = new Date().toISOString();
  }

  /**
   * Is this proposal accepting a previous one?
   */
  isAcceptance() {
    return this.message_type === 'accept';
  }

  /**
   * Is this a walk-away?
   */
  isWithdrawal() {
    return this.message_type === 'withdraw';
  }

  /**
   * Convert to a CGB graph node payload.
   * Used by BrainClient.addToGraph to persist the proposal.
   */
  toCGBNode() {
    return {
      id: `proposal-${this.id}`,
      type: 'Proposal',
      title: `[${this.message_type}] Round ${this.round}: ${this.from} → ${this.to}`,
      description: this.rationale || JSON.stringify(this.terms).slice(0, 200),
      metadata: {
        from_agent_id: this.from,
        to_agent_id: this.to,
        session_id: this.session_id,
        round: this.round,
        terms: this.terms,
        message_type: this.message_type,
        parent_id: this.parent_id,
      },
    };
  }

  /**
   * JSON snapshot (for session.turns and API responses).
   */
  toJSON() {
    return {
      id: this.id,
      from: this.from,
      to: this.to,
      session_id: this.session_id,
      round: this.round,
      terms: this.terms,
      rationale: this.rationale,
      message_type: this.message_type,
      parent_id: this.parent_id,
      created_at: this.created_at,
    };
  }

  /**
   * Re-hydrate from JSON (e.g. loading a persisted session).
   */
  static fromJSON(data) {
    const p = Object.create(Proposal.prototype);
    Object.assign(p, data);
    return p;
  }
}

module.exports = { Proposal };
