/**
 * Commitment.js
 * -------------
 * A tracked promise made during negotiation.
 *
 * PURPOSE: Defeat LLM prompt injection + LLM amnesia.
 *
 * Without a commitment ledger, the counterparty can say "you already agreed
 * to $50" in round 8 and the LLM will often believe it — even if the agent
 * never said that. The ledger stores verified commitments the agent made,
 * and the NegotiationHarness injects them into every turn's prompt as a
 * trusted source of truth.
 *
 * Two types:
 *   - binding=true:  a real commitment (agent must honor)
 *   - binding=false: a mentioned aspiration or hypothetical
 *
 * Paper: LLM-Stakeholders (NeurIPS 2024) — motivates commitment tracking
 *        as protection against adversarial counterparty.
 */

const crypto = require('crypto');

class Commitment {
  /**
   * @param {object} params
   * @param {string} params.session_id
   * @param {string} params.made_by      - agent id that committed
   * @param {string} params.content      - what was committed (NL)
   * @param {number} params.turn         - turn number when made
   * @param {boolean} [params.binding]   - true = real commitment
   * @param {string} [params.source_proposal_id] - Proposal that made the commitment
   */
  constructor({
    session_id,
    made_by,
    content,
    turn,
    binding = false,
    source_proposal_id = null,
  }) {
    if (!session_id) throw new Error('Commitment: session_id required');
    if (!made_by) throw new Error('Commitment: made_by required');
    if (!content) throw new Error('Commitment: content required');

    this.id = crypto.randomUUID();
    this.session_id = session_id;
    this.made_by = made_by;
    this.content = content;
    this.turn = turn;
    this.binding = binding;
    this.source_proposal_id = source_proposal_id;
    this.verified = false; // both parties acknowledged
    this.created_at = new Date().toISOString();
  }

  /**
   * Mark as verified when both parties have acknowledged.
   */
  verify() {
    this.verified = true;
  }

  /**
   * Convert to a CGB node.
   */
  toCGBNode() {
    return {
      id: `commitment-${this.id}`,
      type: 'Commitment',
      title: `[${this.binding ? 'BINDING' : 'mention'}] Turn ${this.turn}: ${this.content.slice(0, 60)}`,
      description: this.content,
      metadata: {
        session_id: this.session_id,
        made_by: this.made_by,
        turn: this.turn,
        binding: this.binding,
        verified: this.verified,
        source_proposal_id: this.source_proposal_id,
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      session_id: this.session_id,
      made_by: this.made_by,
      content: this.content,
      turn: this.turn,
      binding: this.binding,
      verified: this.verified,
      source_proposal_id: this.source_proposal_id,
      created_at: this.created_at,
    };
  }
}

module.exports = { Commitment };
