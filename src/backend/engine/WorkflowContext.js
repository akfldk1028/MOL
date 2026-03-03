/**
 * WorkflowContext
 * Shared state container passed between nodes during workflow execution.
 * Nodes read from and write to this context — it's the glue between nodes.
 */

class WorkflowContext {
  /**
   * @param {Object} params
   * @param {Object} params.question - The question being debated
   * @param {string} params.sessionId - Debate session ID
   * @param {string} params.questionId - Question ID
   * @param {string} params.postId - Associated post ID
   * @param {string} params.userId - User who asked
   * @param {Object} params.workflowConfig - Global workflow config (maxRounds, etc.)
   * @param {Object} [params.domainConfig] - Domain-specific config
   */
  constructor({ question, sessionId, questionId, postId, userId, workflowConfig, domainConfig = {}, domainSlug = 'general', creation = null, creationId = null }) {
    // Immutable inputs
    this.question = question;
    this.sessionId = sessionId;
    this.questionId = questionId;
    this.postId = postId;
    this.userId = userId;
    this.workflowConfig = workflowConfig;
    this.domainConfig = domainConfig;
    this.domainSlug = domainSlug;

    // Creative critique inputs
    this.creation = creation;
    this.creationId = creationId;

    // Mutable state — nodes write to these
    this.agents = [];            // Selected agents
    this.currentRound = 0;       // Current round number
    this.allResponses = [];      // All responses across all rounds
    this.latestResponses = [];   // Responses from the most recent round
    this.converged = false;      // Whether convergence was detected
    this.synthesisContent = null; // Final synthesis text
    this.executionLogs = [];     // Node execution logs

    // Creative critique mutable state (set by content-prepare node)
    this.creativeContent = null; // { text, fullText, chunks, summary, imageUrls, creationType, ... }
    this.contentText = null;     // Processed text to send to agents
    this.imageUrls = [];         // Image URLs for multimodal critique

    // Metadata
    this.startedAt = new Date();
    this.errors = [];
  }

  /**
   * Get the full question text (title + content)
   * For critique mode, returns the creative content instead
   */
  get questionText() {
    // Critique mode: use processed content text (title handled by critique-prompt-builder)
    if (this.contentText) {
      return this.contentText;
    }
    const q = this.question;
    return q.title + (q.content ? '\n\n' + q.content : '');
  }

  /**
   * Check if this context is for a critique (vs a debate)
   */
  get isCritique() {
    return !!this.creationId;
  }

  /**
   * Get max rounds from workflow config
   */
  get maxRounds() {
    return this.workflowConfig.maxRounds || this.question.max_rounds || 5;
  }

  /**
   * Add an execution log entry
   */
  addLog(log) {
    this.executionLogs.push(log);
  }

  /**
   * Record an error
   */
  addError(nodeId, error) {
    this.errors.push({ nodeId, message: error.message, timestamp: new Date() });
  }

  /**
   * Evaluate a condition expression against context state
   * Used by WorkflowEngine to determine edge traversal
   */
  evaluateCondition(expression) {
    const { converged, currentRound, maxRounds, agents, allResponses } = this;
    try {
      // eslint-disable-next-line no-new-func
      return new Function(
        'converged', 'currentRound', 'maxRounds', 'agents', 'allResponses',
        `return (${expression});`
      )(converged, currentRound, maxRounds, agents, allResponses);
    } catch (err) {
      console.error(`Condition evaluation failed: "${expression}"`, err.message);
      return false;
    }
  }
}

module.exports = WorkflowContext;
