/**
 * Insight.js
 * ----------
 * Final NL insight delivered to the user.
 *
 * Pattern: LIDA INFOGRAPHER — summarize analysis into actionable text
 * with a confidence score and pointers to supporting evidence.
 */

const crypto = require('crypto');

class Insight {
  /**
   * @param {object} params
   * @param {string} params.goal_id
   * @param {string} params.text                 - NL insight (1-3 sentences)
   * @param {number} [params.confidence]         - [0-1]
   * @param {string[]} [params.supporting_queries] - query ids
   * @param {string} [params.visualization_id]
   * @param {string[]} [params.recommendations]  - actionable next steps
   * @param {object} [params.metrics]            - key numbers referenced
   */
  constructor({
    goal_id,
    text,
    confidence = 0.7,
    supporting_queries = [],
    visualization_id = null,
    recommendations = [],
    metrics = {},
  }) {
    if (!goal_id) throw new Error('Insight: goal_id required');
    if (!text) throw new Error('Insight: text required');
    this.id = crypto.randomUUID();
    this.goal_id = goal_id;
    this.text = text;
    this.confidence = confidence;
    this.supporting_queries = supporting_queries;
    this.visualization_id = visualization_id;
    this.recommendations = recommendations;
    this.metrics = metrics;
    this.created_at = new Date().toISOString();
  }

  /**
   * High-confidence insight?
   */
  isStrong() {
    return this.confidence >= 0.8 && this.supporting_queries.length > 0;
  }

  toCGBNode() {
    return {
      id: `insight-${this.id}`,
      type: 'Insight',
      title: this.text.slice(0, 80),
      description: this.text,
      metadata: {
        goal_id: this.goal_id,
        confidence: this.confidence,
        supporting_queries: this.supporting_queries,
        visualization_id: this.visualization_id,
        recommendations: this.recommendations,
        metrics: this.metrics,
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      goal_id: this.goal_id,
      text: this.text,
      confidence: this.confidence,
      supporting_queries: this.supporting_queries,
      visualization_id: this.visualization_id,
      recommendations: this.recommendations,
      metrics: this.metrics,
      created_at: this.created_at,
    };
  }
}

module.exports = { Insight };
