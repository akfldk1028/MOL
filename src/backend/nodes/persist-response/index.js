/**
 * Node: persist-response
 * Saves synthesis content to the question record and as a comment.
 * For round responses, persistence is handled inline by round-execute/_shared.js.
 * This node handles synthesis persistence.
 */

const { queryOne } = require('../../config/database');

module.exports = {
  type: 'persist-response',
  name: 'Persist Response',
  description: 'Save response data to the database',

  /**
   * @param {import('../../engine/WorkflowContext')} ctx
   * @param {Object} config
   * @param {boolean} [config.isSynthesis=false]
   */
  async execute(ctx, config = {}) {
    if (config.isSynthesis) {
      // Save synthesis as comment
      const synthesizer = ctx.agents.find(a => a.role === 'synthesizer') || ctx.agents.find(a => a.name === 'synthesizer');
      if (!synthesizer || !ctx.synthesisContent) return { commentId: null };

      const comment = await queryOne(
        `INSERT INTO comments (id, post_id, author_id, content, depth, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 0, NOW(), NOW())
         RETURNING *`,
        [ctx.postId, synthesizer.id, ctx.synthesisContent]
      );

      await queryOne(
        `UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1`,
        [ctx.postId]
      );

      // Update question or creation summary
      if (ctx.creationId) {
        await queryOne(
          `UPDATE creations SET summary_content = $1, agent_count = $2, updated_at = NOW() WHERE id = $3`,
          [ctx.synthesisContent, ctx.agents.length, ctx.creationId]
        );
      } else if (ctx.questionId) {
        await queryOne(
          `UPDATE questions SET summary_content = $1, agent_count = $2, updated_at = NOW() WHERE id = $3`,
          [ctx.synthesisContent, ctx.agents.length, ctx.questionId]
        );
      }

      ctx.synthesisCommentId = comment.id;
      return { commentId: comment.id };
    }

    // Persist a specific field (e.g., final_report)
    if (config.field && ctx.creationId) {
      const allowedFields = ['final_report', 'rewrite_content', 'comparison_content'];
      if (!allowedFields.includes(config.field)) {
        console.warn(`persist-response: unknown field "${config.field}"`);
        return { persisted: false };
      }

      const content = config.field === 'final_report'
        ? (ctx.finalReportContent || ctx.synthesisContent)
        : ctx[config.field];

      if (content) {
        await queryOne(
          `UPDATE creations SET ${config.field} = $1, workflow_phase = 'report', updated_at = NOW() WHERE id = $2`,
          [content, ctx.creationId]
        );
        // Also store in context for downstream use
        if (config.field === 'final_report') {
          ctx.finalReportContent = content;
        }
      }
      return { persisted: true };
    }

    // Non-synthesis persistence (round responses are already persisted in _shared.js)
    return { persisted: true };
  },
};
