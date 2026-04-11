/**
 * ExperienceTrace.js
 * ------------------
 * Successful analysis trace — stored for RL-style reuse.
 *
 * Pattern: MetaGPT Data Interpreter "Experience Recording" — when an analysis
 * succeeds (high insight confidence, user satisfaction), store the full
 * trajectory (Goal → Plan → Queries → Insight) so similar future goals can
 * retrieve and reuse it.
 *
 * The `atlas` agent consults past ExperienceTraces before building a new Plan.
 */

const crypto = require('crypto');

class ExperienceTrace {
  /**
   * @param {object} params
   * @param {string} params.goal_id
   * @param {string} params.plan_id
   * @param {string} params.insight_id
   * @param {boolean} params.success
   * @param {string[]} [params.reusable_tags] - for retrieval
   * @param {object} [params.goal_embedding]  - vector for similarity search
   * @param {number} [params.quality_score]   - 0-1
   */
  constructor({
    goal_id,
    plan_id,
    insight_id,
    success,
    reusable_tags = [],
    goal_embedding = null,
    quality_score = 0.5,
  }) {
    if (!goal_id) throw new Error('ExperienceTrace: goal_id required');
    this.id = crypto.randomUUID();
    this.goal_id = goal_id;
    this.plan_id = plan_id;
    this.insight_id = insight_id;
    this.success = success;
    this.reusable_tags = reusable_tags;
    this.goal_embedding = goal_embedding;
    this.quality_score = quality_score;
    this.created_at = new Date().toISOString();
  }

  /**
   * Does this trace match a new goal?
   * Simple keyword/tag matching for now; can be upgraded to vector search.
   */
  matches(newGoal, options = {}) {
    const { minOverlap = 0.3 } = options;
    if (!newGoal || !newGoal.nl_intent) return false;
    if (this.reusable_tags.length === 0) return false;
    const newTokens = newGoal.nl_intent.toLowerCase().split(/\s+/);
    const overlap = this.reusable_tags.filter((tag) =>
      newTokens.some((t) => t.includes(tag.toLowerCase()))
    ).length;
    return overlap / this.reusable_tags.length >= minOverlap;
  }

  toCGBNode() {
    return {
      id: `trace-${this.id}`,
      type: 'ExperienceTrace',
      title: `Experience Trace (quality ${this.quality_score.toFixed(2)})`,
      description: `Plan ${this.plan_id?.slice(0, 8)} → Insight ${this.insight_id?.slice(0, 8)}, success=${this.success}`,
      metadata: {
        goal_id: this.goal_id,
        plan_id: this.plan_id,
        insight_id: this.insight_id,
        success: this.success,
        reusable_tags: this.reusable_tags,
        quality_score: this.quality_score,
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      goal_id: this.goal_id,
      plan_id: this.plan_id,
      insight_id: this.insight_id,
      success: this.success,
      reusable_tags: this.reusable_tags,
      quality_score: this.quality_score,
      created_at: this.created_at,
    };
  }
}

module.exports = { ExperienceTrace };
