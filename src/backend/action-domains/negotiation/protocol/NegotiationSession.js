/**
 * NegotiationSession.js
 * ---------------------
 * Stateful session for a multi-round negotiation between 2+ parties.
 *
 * Extends SessionBase with negotiation-specific state:
 *   - parties:     [{ agent_id, role, utility, batna }]
 *   - proposals:   history of offers/counter-offers
 *   - commitments: ledger of tracked promises (prompt injection defense)
 *
 * State transitions are validated through protocol/states.js.
 */

const { SessionBase } = require('../../_base/session-base');
const { STATES, assertTransition, isTerminal } = require('./states');
const { Proposal } = require('../components/Proposal');
const { Deal } = require('../components/Deal');
const { Commitment } = require('../components/Commitment');
const { DeadlineManager } = require('./deadline');

class NegotiationSession extends SessionBase {
  /**
   * @param {object} params
   * @param {Array<object>} params.parties - [{ agent_id, role, utility, batna }]
   * @param {string} params.topic          - NL description of what's being negotiated
   * @param {number} [params.deadlineTurns=20]
   * @param {object} [params.metadata]
   */
  constructor({ parties, topic, deadlineTurns = 20, metadata = {} }) {
    if (!Array.isArray(parties) || parties.length < 2) {
      throw new Error('NegotiationSession: at least 2 parties required');
    }
    if (!topic) throw new Error('NegotiationSession: topic required');

    super({
      domain: 'negotiation',
      deadlineTurns,
      metadata: { ...metadata, topic },
    });

    this.parties = parties;           // [{ agent_id, role, utility, batna }]
    this.topic = topic;
    this.proposals = [];               // Proposal[]
    this.commitments = [];             // Commitment[]
    this.state = STATES.OPEN;
    this.deadline = new DeadlineManager(this);
  }

  // ─────────────────────────────────────────────
  // State management
  // ─────────────────────────────────────────────

  start() {
    assertTransition(this.state, STATES.NEGOTIATING);
    this.state = STATES.NEGOTIATING;
    this.startedAt = new Date();
  }

  transition(newState) {
    assertTransition(this.state, newState);
    this.state = newState;
  }

  isTerminal() {
    return isTerminal(this.state);
  }

  // ─────────────────────────────────────────────
  // Proposals
  // ─────────────────────────────────────────────

  addProposal(proposal) {
    if (!(proposal instanceof Proposal)) {
      throw new Error('addProposal: instance of Proposal required');
    }
    if (this.state !== STATES.NEGOTIATING && this.state !== STATES.DEADLOCKED) {
      throw new Error(`addProposal: cannot add in state '${this.state}'`);
    }
    this.proposals.push(proposal);
    this.recordTurn({
      actor: proposal.from,
      action: proposal.message_type,
      payload: proposal.toJSON(),
    });
  }

  latestProposal() {
    return this.proposals.length > 0
      ? this.proposals[this.proposals.length - 1]
      : null;
  }

  currentRound() {
    return this.proposals.length;
  }

  // ─────────────────────────────────────────────
  // Commitments
  // ─────────────────────────────────────────────

  addCommitment(commitment) {
    if (!(commitment instanceof Commitment)) {
      throw new Error('addCommitment: instance of Commitment required');
    }
    this.commitments.push(commitment);
  }

  commitmentsBy(agent_id) {
    return this.commitments.filter((c) => c.made_by === agent_id);
  }

  // ─────────────────────────────────────────────
  // Closing the session
  // ─────────────────────────────────────────────

  /**
   * Try to accept a proposal → close with Deal.
   * @param {string} proposal_id  - the Proposal being accepted
   * @param {string} by_agent_id  - agent doing the accepting
   * @returns {Deal}
   */
  tryAccept(proposal_id, by_agent_id) {
    const proposal = this.proposals.find((p) => p.id === proposal_id);
    if (!proposal) throw new Error(`tryAccept: proposal ${proposal_id} not found`);
    if (proposal.to !== by_agent_id) {
      throw new Error(`tryAccept: ${by_agent_id} cannot accept a proposal addressed to ${proposal.to}`);
    }
    const deal = Deal.fromAcceptedProposal(this, proposal);
    assertTransition(this.state, STATES.CLOSED_DEAL);
    this.state = STATES.CLOSED_DEAL;
    this.result = deal;
    this.closedAt = new Date();
    return deal;
  }

  /**
   * One party withdraws → close with no deal.
   */
  tryWithdraw(agent_id, reason = '') {
    assertTransition(this.state, STATES.CLOSED_NO_DEAL);
    this.state = STATES.CLOSED_NO_DEAL;
    this.result = { withdrawn_by: agent_id, reason };
    this.closedAt = new Date();
  }

  /**
   * Deadline reached or deadlock timeout → close with no deal.
   */
  closeByDeadline(reason = 'deadline_reached') {
    assertTransition(this.state, STATES.CLOSED_NO_DEAL);
    this.state = STATES.CLOSED_NO_DEAL;
    this.result = { reason };
    this.closedAt = new Date();
  }

  /**
   * Snapshot (extends SessionBase.toJSON).
   */
  toJSON() {
    return {
      ...super.toJSON(),
      topic: this.topic,
      parties: this.parties.map((p) => ({
        agent_id: p.agent_id,
        role: p.role,
        // Do NOT serialize utility or batna — private state
      })),
      proposals: this.proposals.map((p) => p.toJSON()),
      commitments: this.commitments.map((c) => c.toJSON()),
    };
  }
}

module.exports = {
  NegotiationSession,
  STATES,
};
