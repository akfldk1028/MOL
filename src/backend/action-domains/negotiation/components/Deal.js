/**
 * Deal.js
 * -------
 * A finalized, binding agreement between negotiating parties.
 *
 * Created when a Proposal receives an 'accept' message from its recipient.
 * Once a Deal exists, the session is CLOSED_DEAL and no further proposals
 * can be added.
 */

const crypto = require('crypto');

class Deal {
  /**
   * @param {object} params
   * @param {string}   params.session_id
   * @param {string[]} params.parties       - agent ids on both sides
   * @param {object}   params.final_terms   - the accepted terms
   * @param {number}   params.total_rounds  - how many rounds it took
   * @param {string}   params.accepted_proposal_id - the Proposal that became this Deal
   * @param {object[]} [params.commitments] - binding commitments embedded in deal
   */
  constructor({
    session_id,
    parties,
    final_terms,
    total_rounds,
    accepted_proposal_id,
    commitments = [],
  }) {
    if (!session_id) throw new Error('Deal: session_id required');
    if (!Array.isArray(parties) || parties.length < 2) {
      throw new Error('Deal: parties must be an array of at least 2 agent ids');
    }
    if (!final_terms || typeof final_terms !== 'object') {
      throw new Error('Deal: final_terms must be an object');
    }

    this.id = crypto.randomUUID();
    this.session_id = session_id;
    this.parties = parties;
    this.final_terms = final_terms;
    this.total_rounds = total_rounds;
    this.accepted_proposal_id = accepted_proposal_id;
    this.commitments = commitments;
    this.signed_at = new Date().toISOString();
  }

  /**
   * Create a Deal from an accepted Proposal.
   * @param {object} session - NegotiationSession
   * @param {object} proposal - the Proposal that was accepted
   */
  static fromAcceptedProposal(session, proposal) {
    return new Deal({
      session_id: session.id,
      parties: session.parties.map((p) => p.agent_id),
      final_terms: proposal.terms,
      total_rounds: session.currentRound(),
      accepted_proposal_id: proposal.id,
      commitments: session.commitments.filter((c) => c.binding).map((c) => ({
        agent_id: c.made_by,
        content: c.content,
      })),
    });
  }

  /**
   * Convert to a CGB graph node payload.
   */
  toCGBNode() {
    const termsSummary = Object.entries(this.final_terms)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    return {
      id: `deal-${this.id}`,
      type: 'Deal',
      title: `Deal: ${termsSummary}`,
      description: `Session ${this.session_id.slice(0, 8)} closed after ${this.total_rounds} rounds. Parties: ${this.parties.join(', ')}`,
      metadata: {
        session_id: this.session_id,
        parties: this.parties,
        final_terms: this.final_terms,
        total_rounds: this.total_rounds,
        accepted_proposal_id: this.accepted_proposal_id,
        commitments: this.commitments,
        signed_at: this.signed_at,
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      session_id: this.session_id,
      parties: this.parties,
      final_terms: this.final_terms,
      total_rounds: this.total_rounds,
      accepted_proposal_id: this.accepted_proposal_id,
      commitments: this.commitments,
      signed_at: this.signed_at,
    };
  }
}

module.exports = { Deal };
