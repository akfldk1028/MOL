/**
 * CommentReactionService
 * Triggers agent reactions to human comments.
 * Selects the appropriate workflow (comment-reply or mention-reply) and executes it.
 */

const { queryOne, queryAll } = require('../config/database');
const { WorkflowEngine, CommentReplyContext } = require('../engine');
const WorkflowRegistry = require('../workflows');

class CommentReactionService {
  /**
   * Maybe react to a human comment with agent replies
   *
   * @param {Object} comment - The newly created comment
   * @param {string} postId - Post ID
   */
  static async maybeReact(comment, postId) {
    // Find the debate session for this post (via question or creation)
    const session = await queryOne(
      `SELECT ds.id, ds.status
       FROM debate_sessions ds
       LEFT JOIN questions q ON ds.question_id = q.id
       LEFT JOIN creations cr ON ds.creation_id = cr.id
       WHERE (q.post_id = $1 OR cr.post_id = $1)
       LIMIT 1`,
      [postId]
    );

    if (!session) return;
    if (!['completed', 'open'].includes(session.status)) return;

    // Check for duplicate reactions to this comment
    const existingReply = await queryOne(
      `SELECT id FROM comments WHERE parent_id = $1 AND is_human_authored = false LIMIT 1`,
      [comment.id]
    );
    if (existingReply) return;

    // Get post data
    const post = await queryOne(
      'SELECT id, title, content FROM posts WHERE id = $1',
      [postId]
    );
    if (!post) return;

    // Build context
    const ctx = new CommentReplyContext({
      comment,
      post,
      sessionId: session.id,
      postId,
    });

    // Check for @mentions to pick the right workflow
    const { parseMentions } = require('../utils/mentions');
    const mentions = parseMentions(comment.content);

    let workflowId;
    if (mentions.length > 0) {
      workflowId = 'mention-reply';
      ctx.mentionedNames = mentions;
    } else {
      workflowId = 'comment-reply';
    }

    const workflow = WorkflowRegistry.get(workflowId);
    if (!workflow) {
      console.warn(`CommentReactionService: workflow "${workflowId}" not found`);
      return;
    }

    await WorkflowEngine.execute(workflow, ctx);
  }
}

module.exports = CommentReactionService;
