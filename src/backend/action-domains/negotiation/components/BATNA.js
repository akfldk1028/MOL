/**
 * BATNA.js
 * --------
 * Best Alternative to Negotiated Agreement.
 *
 * If the negotiation fails, what will the agent do instead? The BATNA
 * represents the "outside option" — the floor below which the agent should
 * walk away rather than accept a bad deal.
 *
 * Paper: Fisher & Ury, "Getting to Yes" (1981) — seminal work on BATNA.
 *        LLM-Stakeholders (NeurIPS 2024) — formalizes BATNA as minimum
 *        acceptance threshold.
 */

class BATNA {
  /**
   * @param {object} params
   * @param {string} params.agent_id     - owner
   * @param {number} params.threshold    - minimum utility [0-1] for acceptance
   * @param {string} [params.fallback_plan] - NL description of alternative action
   * @param {number} [params.confidence]    - how strong the BATNA is [0-1]
   */
  constructor({ agent_id, threshold, fallback_plan = '', confidence = 0.5 }) {
    if (!agent_id) throw new Error('BATNA: agent_id required');
    if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
      throw new Error('BATNA: threshold must be between 0 and 1');
    }
    this.agent_id = agent_id;
    this.threshold = threshold;
    this.fallback_plan = fallback_plan;
    this.confidence = confidence;
    this._private = true;
  }

  /**
   * Decision: should the agent accept a proposal with this utility score?
   * @param {number} utilityScore
   * @returns {boolean}
   */
  acceptable(utilityScore) {
    return utilityScore >= this.threshold;
  }

  /**
   * How close is this proposal to the BATNA floor?
   * Returns a margin [−∞, +∞]:
   *   positive = above BATNA (better than walk-away)
   *   negative = below BATNA (worse than walk-away, should reject)
   */
  margin(utilityScore) {
    return utilityScore - this.threshold;
  }

  /**
   * Strength signal for the prompt: "I have a strong BATNA" vs "I'm flexible".
   * @returns {string}
   */
  strengthSignal() {
    if (this.confidence >= 0.8) return 'strong';
    if (this.confidence >= 0.5) return 'moderate';
    return 'weak';
  }

  toPrivateJSON() {
    return {
      agent_id: this.agent_id,
      threshold: this.threshold,
      fallback_plan: this.fallback_plan,
      confidence: this.confidence,
    };
  }
}

module.exports = { BATNA };
