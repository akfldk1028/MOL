/**
 * Preference.js
 * -------------
 * A single issue preference — "I care about X with weight W, and I'm
 * flexible by F on its value range."
 *
 * Collections of Preferences feed into a UtilityFunction (weights + ranges).
 * This class is useful when building utility incrementally or for
 * per-issue reasoning.
 */

class Preference {
  /**
   * @param {object} params
   * @param {string} params.agent_id
   * @param {string} params.issue         - issue name (e.g. 'price', 'quantity')
   * @param {number} params.weight        - importance [0-1]
   * @param {number} [params.flexibility] - how much the agent is willing to move [0-1]
   * @param {any}    [params.ideal]       - agent's ideal value for this issue
   * @param {any}    [params.reservation] - walk-away value
   * @param {string} [params.direction]   - 'maximize' | 'minimize' | 'exact'
   */
  constructor({
    agent_id,
    issue,
    weight,
    flexibility = 0.5,
    ideal,
    reservation,
    direction = 'exact',
  }) {
    if (!agent_id) throw new Error('Preference: agent_id required');
    if (!issue) throw new Error('Preference: issue required');
    if (typeof weight !== 'number' || weight < 0 || weight > 1) {
      throw new Error('Preference: weight must be between 0 and 1');
    }
    this.agent_id = agent_id;
    this.issue = issue;
    this.weight = weight;
    this.flexibility = flexibility;
    this.ideal = ideal;
    this.reservation = reservation;
    this.direction = direction;
    this._private = true;
  }

  /**
   * Build a UtilityFunction from a list of Preferences.
   */
  static buildUtility(preferences) {
    const { UtilityFunction } = require('./UtilityFunction');
    const agent_id = preferences[0] ? preferences[0].agent_id : null;
    const weights = {};
    const ideal = {};
    const reservation = {};
    for (const p of preferences) {
      weights[p.issue] = p.weight;
      if (p.ideal !== undefined) ideal[p.issue] = p.ideal;
      if (p.reservation !== undefined) reservation[p.issue] = p.reservation;
    }
    return new UtilityFunction({ agent_id, weights, ideal, reservation });
  }

  toJSON() {
    return {
      agent_id: this.agent_id,
      issue: this.issue,
      weight: this.weight,
      flexibility: this.flexibility,
      ideal: this.ideal,
      reservation: this.reservation,
      direction: this.direction,
    };
  }
}

module.exports = { Preference };
