/**
 * Shared helpers for round-execute modes.
 * Extracted from OrchestratorService._generateAgentResponse.
 */

const llmCallNode = require('../llm-call');
const { queryOne } = require('../../config/database');
const OrchestratorService = require('../../services/OrchestratorService');

/**
 * Generate a single agent response and save as comment
 * @param {Object} params
 * @param {Object} params.agent - Agent DB record
 * @param {import('../../engine/WorkflowContext')} params.ctx - Workflow context
 * @param {Object[]} params.previousResponses - Previous responses for context
 * @param {number} params.round - Current round
 * @returns {Promise<Object>} Response data
 */
async function generateAgentResponse({ agent, ctx, previousResponses, round }) {
  const channelId = ctx.creationId || ctx.questionId;
  OrchestratorService.emit(channelId, 'agent_thinking', { agent: agent.name, round });

  // Call LLM
  const { content } = await llmCallNode.execute(ctx, {
    agent,
    role: agent.role,
    round,
    previousResponses: previousResponses.map(r => ({
      agentName: r.agentName,
      role: r.role,
      content: r.content,
    })),
  });

  // Save as comment
  const comment = await queryOne(
    `INSERT INTO comments (id, post_id, author_id, content, depth, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
     RETURNING *`,
    [ctx.postId, agent.id, content, round - 1]
  );

  // Update post comment count
  await queryOne(
    `UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1`,
    [ctx.postId]
  );

  // Update participant turn count
  await queryOne(
    `UPDATE debate_participants SET turn_count = turn_count + 1 WHERE session_id = $1 AND agent_id = $2`,
    [ctx.sessionId, agent.id]
  );

  const responseData = {
    agentName: agent.name,
    role: agent.role,
    content,
    round,
    commentId: comment.id,
    llmProvider: agent.llm_provider,
    llmModel: agent.llm_model,
  };

  OrchestratorService.emit(channelId, 'agent_response', responseData);

  return responseData;
}

module.exports = { generateAgentResponse };
