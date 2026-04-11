/**
 * Analysis.js
 * -----------
 * The result of executing a query + any statistical checks + anomaly flags.
 *
 * This is what the `lens` agent produces — the interpreted numerical result
 * before visualization and insight extraction.
 */

const crypto = require('crypto');

class Analysis {
  /**
   * @param {object} params
   * @param {string} params.query_id
   * @param {any}    params.result             - raw result (rows, values, etc.)
   * @param {string[]} [params.checks_passed]  - e.g. ['non_empty', 'schema_match']
   * @param {object[]} [params.anomalies]      - detected outliers/oddities
   * @param {object} [params.statistics]       - computed stats (mean, stddev, etc.)
   * @param {string} [params.hypothesis_id]    - if this analysis tests a hypothesis
   * @param {string} [params.hypothesis_verdict] - 'supported' | 'refuted' | 'inconclusive'
   */
  constructor({
    query_id,
    result,
    checks_passed = [],
    anomalies = [],
    statistics = {},
    hypothesis_id = null,
    hypothesis_verdict = null,
  }) {
    if (!query_id) throw new Error('Analysis: query_id required');
    this.id = crypto.randomUUID();
    this.query_id = query_id;
    this.result = result;
    this.checks_passed = checks_passed;
    this.anomalies = anomalies;
    this.statistics = statistics;
    this.hypothesis_id = hypothesis_id;
    this.hypothesis_verdict = hypothesis_verdict;
    this.created_at = new Date().toISOString();
  }

  /**
   * Is this a "healthy" analysis (no anomalies, all checks passed)?
   */
  isHealthy() {
    return this.anomalies.length === 0 && this.checks_passed.length > 0;
  }

  /**
   * Short summary for prompts (compact).
   */
  summarize(maxChars = 400) {
    const parts = [];
    if (this.statistics && Object.keys(this.statistics).length > 0) {
      parts.push(`stats: ${JSON.stringify(this.statistics).slice(0, 200)}`);
    }
    if (this.anomalies.length > 0) {
      parts.push(`anomalies: ${this.anomalies.length}`);
    }
    if (this.hypothesis_verdict) {
      parts.push(`hypothesis: ${this.hypothesis_verdict}`);
    }
    const out = parts.join(' | ');
    return out.length > maxChars ? out.slice(0, maxChars) + '...' : out;
  }

  toCGBNode() {
    return {
      id: `analysis-${this.id}`,
      type: 'Analysis',
      title: `Analysis: ${this.checks_passed.length} checks, ${this.anomalies.length} anomalies`,
      description: this.summarize(300),
      metadata: {
        query_id: this.query_id,
        checks_passed: this.checks_passed,
        anomalies: this.anomalies,
        statistics: this.statistics,
        hypothesis_id: this.hypothesis_id,
        hypothesis_verdict: this.hypothesis_verdict,
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      query_id: this.query_id,
      result: this.result,
      checks_passed: this.checks_passed,
      anomalies: this.anomalies,
      statistics: this.statistics,
      hypothesis_id: this.hypothesis_id,
      hypothesis_verdict: this.hypothesis_verdict,
      created_at: this.created_at,
    };
  }
}

module.exports = { Analysis };
