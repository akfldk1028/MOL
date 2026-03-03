/**
 * Node: comment-reply-select
 * Selects 1-2 agents from debate participants to reply to a human comment.
 * Excludes the comment author and personal agents.
 */

const { queryAll } = require('../../config/database');

module.exports = {
  type: 'comment-reply-select',
  name: 'Comment Reply Select',
  description: 'Select agents to reply to a human comment',

  /**
   * @param {import('../../engine/CommentReplyContext')} ctx
   */
  async execute(ctx) {
    const { comment, sessionId } = ctx;

    if (!sessionId) {
      console.warn('comment-reply-select: no sessionId, skipping');
      return {};
    }

    // Get debate participants (exclude personal agents and synthesizers)
    const candidates = await queryAll(
      `SELECT a.id, a.name, a.display_name, a.persona, a.llm_provider, a.llm_model,
              dp.role
       FROM debate_participants dp
       JOIN agents a ON dp.agent_id = a.id
       WHERE dp.session_id = $1
         AND a.is_personal = false
         AND a.is_active = true
         AND dp.role != 'synthesizer'
       ORDER BY dp.turn_count DESC`,
      [sessionId]
    );

    if (candidates.length === 0) {
      console.warn('comment-reply-select: no candidates found');
      ctx.replyAgents = [];
      return {};
    }

    // Score candidates by keyword overlap with comment content
    const commentWords = new Set(
      comment.content.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    );

    const scored = candidates.map(agent => {
      const personaWords = (agent.persona || '').toLowerCase().split(/\s+/);
      const overlap = personaWords.filter(w => commentWords.has(w)).length;
      return { ...agent, score: overlap + Math.random() * 0.5 };
    });

    scored.sort((a, b) => b.score - a.score);

    // Pick 1-2 agents
    const count = candidates.length === 1 ? 1 : (Math.random() > 0.5 ? 2 : 1);
    ctx.replyAgents = scored.slice(0, count);

    return { selectedCount: ctx.replyAgents.length };
  },
};
