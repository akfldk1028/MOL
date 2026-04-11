/**
 * Hypothesis.js
 * -------------
 * A testable hypothesis about the data.
 *
 * Optional but powerful: structured hypothesis → targeted query → validation.
 * Good for causal questions ("did X cause Y?").
 */

const crypto = require('crypto');

class Hypothesis {
  /**
   * @param {object} params
   * @param {string} params.statement        - NL hypothesis
   * @param {boolean} [params.testable]      - can this be tested with the data?
   * @param {string} [params.null_hypothesis] - the null
   * @param {string[]} [params.metrics]      - which metrics would confirm/refute
   */
  constructor({ statement, testable = true, null_hypothesis = null, metrics = [] }) {
    if (!statement) throw new Error('Hypothesis: statement required');
    this.id = crypto.randomUUID();
    this.statement = statement;
    this.testable = testable;
    this.null_hypothesis = null_hypothesis;
    this.metrics = metrics;
    this.status = 'pending'; // 'pending' | 'supported' | 'refuted' | 'inconclusive'
    this.created_at = new Date().toISOString();
  }

  resolve(status) {
    if (!['supported', 'refuted', 'inconclusive'].includes(status)) {
      throw new Error(`Hypothesis.resolve: invalid status '${status}'`);
    }
    this.status = status;
  }

  toCGBNode() {
    return {
      id: `hypothesis-${this.id}`,
      type: 'Hypothesis',
      title: this.statement.slice(0, 80),
      description: this.statement,
      metadata: {
        testable: this.testable,
        null_hypothesis: this.null_hypothesis,
        metrics: this.metrics,
        status: this.status,
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      statement: this.statement,
      testable: this.testable,
      null_hypothesis: this.null_hypothesis,
      metrics: this.metrics,
      status: this.status,
      created_at: this.created_at,
    };
  }
}

module.exports = { Hypothesis };
