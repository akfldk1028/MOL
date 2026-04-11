/**
 * Goal.js
 * -------
 * User's analysis goal in natural language.
 *
 * e.g. "Why did my YouTube views drop 40% last month?"
 *      "Which 3 topics drive the highest engagement on my channel?"
 */

const crypto = require('crypto');

class Goal {
  /**
   * @param {object} params
   * @param {string} params.nl_intent        - user's goal in NL
   * @param {string} [params.user_id]        - who asked
   * @param {object} [params.constraints]    - e.g. { time_range, audience }
   * @param {string[]} [params.expected_outputs] - e.g. ['chart', 'insight', 'recommendation']
   */
  constructor({ nl_intent, user_id = null, constraints = {}, expected_outputs = ['insight'] }) {
    if (!nl_intent) throw new Error('Goal: nl_intent required');
    this.id = crypto.randomUUID();
    this.nl_intent = nl_intent;
    this.user_id = user_id;
    this.constraints = constraints;
    this.expected_outputs = expected_outputs;
    this.created_at = new Date().toISOString();
  }

  toCGBNode() {
    return {
      id: `goal-${this.id}`,
      type: 'Goal',
      title: this.nl_intent.slice(0, 80),
      description: this.nl_intent,
      metadata: {
        user_id: this.user_id,
        constraints: this.constraints,
        expected_outputs: this.expected_outputs,
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      nl_intent: this.nl_intent,
      user_id: this.user_id,
      constraints: this.constraints,
      expected_outputs: this.expected_outputs,
      created_at: this.created_at,
    };
  }
}

module.exports = { Goal };
