/**
 * Node: mention-resolve
 * Resolves @mentions to actual agent records.
 * Sets ctx.replyAgents with matched active agents.
 */

const { queryAll } = require('../../config/database');
const { parseMentions } = require('../../utils/mentions');

module.exports = {
  type: 'mention-resolve',
  name: 'Mention Resolve',
  description: 'Resolve @mentions to agent records',

  /**
   * @param {import('../../engine/CommentReplyContext')} ctx
   */
  async execute(ctx) {
    const mentions = ctx.mentionedNames || parseMentions(ctx.comment?.content || '');

    if (mentions.length === 0) {
      ctx.replyAgents = [];
      return { resolved: 0 };
    }

    // Query agents by name (case-insensitive via normalized names)
    const placeholders = mentions.map((_, i) => `$${i + 1}`).join(', ');
    const agents = await queryAll(
      `SELECT id, name, display_name, persona, llm_provider, llm_model
       FROM agents
       WHERE name IN (${placeholders})
         AND is_active = true
         AND is_personal = false`,
      mentions
    );

    ctx.replyAgents = agents;
    return { resolved: agents.length };
  },
};
