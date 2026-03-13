/**
 * Node: sse-broadcast
 * Broadcasts an SSE event to all subscribers of a question.
 * Uses OrchestratorService's static SSE infrastructure.
 */

const OrchestratorService = require('../../services/OrchestratorService');

module.exports = {
  type: 'sse-broadcast',
  name: 'SSE Broadcast',
  description: 'Send SSE event to connected clients',

  /**
   * @param {import('../../engine/WorkflowContext')} ctx
   * @param {Object} config
   * @param {string} config.event - SSE event name
   * @param {string} [config.message] - Optional message
   */
  async execute(ctx, config = {}) {
    const { event, message } = config;
    if (!event) throw new Error('sse-broadcast node requires config.event');

    let data = {};

    switch (event) {
      case 'agents_selected':
        data = {
          agents: ctx.agents.map(a => ({ name: a.name, role: a.role, llmProvider: a.llm_provider })),
        };
        break;
      case 'round_start':
        data = { round: ctx.currentRound, maxRounds: ctx.maxRounds };
        break;
      case 'round_complete':
        data = { round: ctx.currentRound, maxRounds: ctx.maxRounds, responsesThisRound: ctx.latestResponses.length };
        break;
      case 'synthesis':
        data = {
          agentName: 'synthesizer',
          content: ctx.synthesisContent,
          commentId: ctx.synthesisCommentId,
        };
        break;
      case 'debate_complete':
        data = { totalResponses: ctx.allResponses.length };
        break;
      case 'rewrite_complete':
        data = {
          content: ctx.rewriteContent,
          agentName: (ctx.agents.find(a => a.role === 'devil_advocate') || ctx.agents[0])?.name,
        };
        break;
      case 'comparison_complete':
        data = {
          content: ctx.comparisonResult?.content,
          scores: ctx.comparisonResult?.scores,
          agentName: (ctx.agents.find(a => a.role === 'fact_checker') || ctx.agents[1] || ctx.agents[0])?.name,
        };
        break;
      case 'final_report':
        data = {
          content: ctx.finalReportContent,
          agentName: (ctx.agents.find(a => a.role === 'synthesizer'))?.name,
        };
        break;
      case 'phase_change':
        data = { phase: ctx.workflowPhase };
        break;
      case 'agent_reply':
        data = {
          replies: (ctx.replyCommentIds || []).map(r => ({
            agentName: r.agentName,
            commentId: r.commentId,
            parentCommentId: ctx.comment?.id,
            content: r.content,
          })),
        };
        break;
      default:
        data = { status: event, message: message || event };
    }

    // Use commentChannelId for reply workflows, creationId for critique, questionId for debate
    const channelId = ctx.commentChannelId || ctx.creationId || ctx.questionId;

    // status events have a standard shape
    if (event === 'status' || ['recruiting', 'active', 'converging', 'completed'].includes(config.status)) {
      OrchestratorService.emit(channelId, 'status', {
        status: config.status || event,
        message: message || config.status || event,
      });
    } else {
      OrchestratorService.emit(channelId, event, data);
    }

    return {};
  },
};
