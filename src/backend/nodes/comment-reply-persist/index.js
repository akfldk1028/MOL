/**
 * Node: comment-reply-persist
 * Persists generated agent replies as Comment records in the database.
 */

const CommentService = require('../../services/CommentService');

module.exports = {
  type: 'comment-reply-persist',
  name: 'Comment Reply Persist',
  description: 'Save agent replies as comments',

  /**
   * @param {import('../../engine/CommentReplyContext')} ctx
   */
  async execute(ctx) {
    const { replyContents, comment, postId } = ctx;

    if (!replyContents || replyContents.length === 0) {
      ctx.replyCommentIds = [];
      return {};
    }

    const ids = [];

    for (const reply of replyContents) {
      try {
        const saved = await CommentService.create({
          postId,
          authorId: reply.agentId,
          content: reply.content,
          parentId: comment.id,
          isHumanAuthored: false,
        });
        ids.push({ commentId: saved.id, agentName: reply.agentName, content: reply.content });
      } catch (err) {
        console.error(`comment-reply-persist: save error for ${reply.agentName}:`, err.message);
      }
    }

    ctx.replyCommentIds = ids;
    return { persistedCount: ids.length };
  },
};
