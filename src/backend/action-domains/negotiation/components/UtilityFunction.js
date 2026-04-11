/**
 * UtilityFunction.js
 * ------------------
 * Private utility function — scores proposals from a single agent's perspective.
 *
 * CRITICAL SECURITY NOTE:
 *   The weights and batna_score MUST NEVER appear in the counterparty's
 *   prompt. The NegotiationHarness is responsible for filtering this out
 *   before building the turn prompt for the other agent.
 *
 * Paper: LLM-Stakeholders (NeurIPS 2024) — formalizes private utility +
 *        BATNA threshold for multi-agent negotiation.
 */

class UtilityFunction {
  /**
   * @param {object} params
   * @param {string} params.agent_id     - owner (whose private state is this)
   * @param {object} params.weights      - issue → weight (normalized to 1.0)
   *                                       e.g. { price: 0.5, quantity: 0.3, deadline: 0.2 }
   * @param {object} params.ideal        - agent's most-desired terms (issue → value)
   * @param {object} params.reservation  - agent's walk-away values (issue → value)
   * @param {number} [params.batna_score] - minimum acceptable utility [0-1]
   */
  constructor({ agent_id, weights, ideal, reservation, batna_score = 0.3 }) {
    if (!agent_id) throw new Error('UtilityFunction: agent_id required');
    if (!weights || typeof weights !== 'object') {
      throw new Error('UtilityFunction: weights object required');
    }

    this.agent_id = agent_id;
    this.weights = this._normalize(weights);
    this.ideal = ideal || {};
    this.reservation = reservation || {};
    this.batna_score = batna_score;

    // Tag as private — accessed by filters in HarnessBase
    this._private = true;
  }

  _normalize(weights) {
    const sum = Object.values(weights).reduce((a, b) => a + Number(b || 0), 0);
    if (sum <= 0) return weights;
    const norm = {};
    for (const [k, v] of Object.entries(weights)) {
      norm[k] = Number(v || 0) / sum;
    }
    return norm;
  }

  /**
   * Score a proposal [0-1] where 1 = ideal, 0 = reservation or worse.
   * For each issue, linearly interpolate between reservation and ideal,
   * then weight by importance.
   * @param {object} proposal - Proposal instance or { terms: {...} }
   */
  score(proposal) {
    const terms = proposal.terms || proposal;
    let total = 0;
    for (const [issue, weight] of Object.entries(this.weights)) {
      const value = terms[issue];
      if (value === undefined || value === null) continue;

      const ideal = this.ideal[issue];
      const reservation = this.reservation[issue];

      if (ideal === undefined || reservation === undefined) {
        // No preference range — treat as satisfied
        total += weight;
        continue;
      }

      // Linear interpolation, clamped [0, 1]
      let v = 0;
      if (ideal !== reservation) {
        v = (Number(value) - Number(reservation)) / (Number(ideal) - Number(reservation));
      } else if (Number(value) === Number(ideal)) {
        v = 1;
      }
      v = Math.max(0, Math.min(1, v));
      total += weight * v;
    }
    return Math.round(total * 1000) / 1000;
  }

  /**
   * Is this proposal acceptable given the agent's BATNA?
   */
  acceptable(proposal) {
    return this.score(proposal) >= this.batna_score;
  }

  /**
   * PUBLIC-safe summary (for logging, debugging).
   * Never include weights or batna_score in anything the counterparty sees.
   */
  toPublicSummary() {
    return {
      agent_id: this.agent_id,
      num_issues: Object.keys(this.weights).length,
      _private: true,
    };
  }

  /**
   * Private JSON (for own agent's prompt injection only).
   */
  toPrivateJSON() {
    return {
      agent_id: this.agent_id,
      weights: this.weights,
      ideal: this.ideal,
      reservation: this.reservation,
      batna_score: this.batna_score,
    };
  }

  /**
   * CGB node — stored with visibility='private' for audit but not query-visible
   * to other agents' context builders.
   */
  toCGBNode() {
    return {
      id: `utility-${this.agent_id}-${Date.now()}`,
      type: 'UtilityFunction',
      title: `Private utility (${Object.keys(this.weights).length} issues)`,
      description: 'Private state — not visible to counterparty',
      metadata: {
        agent_id: this.agent_id,
        num_issues: Object.keys(this.weights).length,
        batna_score: this.batna_score,
        visibility: 'private',
      },
    };
  }
}

module.exports = { UtilityFunction };
