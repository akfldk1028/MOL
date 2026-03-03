/**
 * CommentReplyContext
 * Lightweight context for comment-reply and mention-reply workflows.
 * Implements the minimal interface required by WorkflowEngine.
 */

class CommentReplyContext {
  /**
   * @param {Object} params
   * @param {Object} params.comment - The triggering comment
   * @param {Object} params.post - The associated post
   * @param {string} params.sessionId - Debate session ID (if any)
   * @param {string} params.postId - Post ID
   */
  constructor({ comment, post, sessionId = null, postId }) {
    // Immutable inputs
    this.comment = comment;
    this.post = post;
    this.sessionId = sessionId;
    this.postId = postId;

    // Channel key for SSE (use postId since this is post-level activity)
    this.questionId = null;
    this.creationId = null;
    this.commentChannelId = postId; // SSE channel for comment replies

    // Mutable state — nodes write to these
    this.replyAgents = [];       // Agents selected to reply
    this.replyContents = [];     // Generated reply texts
    this.replyCommentIds = [];   // Persisted comment IDs

    // Execution tracking
    this.executionLogs = [];
    this.errors = [];
    this.startedAt = new Date();
  }

  /**
   * WorkflowEngine calls evaluateCondition for edge traversal.
   * Comment-reply workflows have no branching, so always return false.
   */
  evaluateCondition() {
    return false;
  }

  addLog(log) {
    this.executionLogs.push(log);
  }

  addError(nodeId, error) {
    this.errors.push({ nodeId, message: error.message, timestamp: new Date() });
  }
}

module.exports = CommentReplyContext;
