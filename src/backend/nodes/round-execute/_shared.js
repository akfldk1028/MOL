/**
 * Shared helpers for round-execute modes.
 * Extracted from OrchestratorService._generateAgentResponse.
 *
 * Supports two execution modes:
 * 1. Legacy (default): Direct llm-call node execution
 * 2. Harness mode: IMPACT AgentHarness with validate/retry/trajectory
 *    Activated when ctx.workflowConfig.useHarness === true
 */

const llmCallNode = require('../llm-call');
const { queryOne } = require('../../config/database');
const OrchestratorService = require('../../services/OrchestratorService');

/**
 * Generate a single agent response and save as comment.
 * Uses AgentHarness if ctx.workflowConfig.useHarness is true.
 *
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

  let rawContent;

  // ── Harness mode: IMPACT framework (validate + retry + trajectory) ──
  // Default: harness ON. Explicitly set useHarness:false in workflow.json to opt out.
  const useHarness = ctx.workflowConfig?.useHarness !== false;
  if (useHarness) {
    rawContent = await _harnessGenerate({ agent, ctx, previousResponses, round });
  } else {
    // ── Legacy mode: direct LLM call (deprecated) ──
    const result = await llmCallNode.execute(ctx, {
      agent,
      role: agent.role,
      round,
      previousResponses: previousResponses.map(r => ({
        agentName: r.agentName,
        role: r.role,
        content: r.content,
      })),
    });
    rawContent = result.content;
  }

  // Strip hallucinated @mentions (only mention-debate system should produce @mentions)
  const content = rawContent.replace(/@([\w\u3131-\u318E\uAC00-\uD7A3._]{2,32})/gi, '$1');

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

/**
 * IMPACT harness execution path.
 * Creates CritiqueHarness config → AgentHarness.run() → validated output.
 */
async function _harnessGenerate({ agent, ctx, previousResponses, round }) {
  const { AgentHarness } = require('../../engine/harness/AgentHarness');
  const { createCritiqueHarness, buildCritiquePrompt } = require('../../engine/harness/agents/CritiqueHarness');

  const domain = ctx.domainSlug || 'general';
  const maxRounds = ctx.workflowConfig?.maxRounds || 3;

  // Create IMPACT config for this agent's role
  const harnessConfig = createCritiqueHarness({
    role: agent.role,
    domain,
    agent: {
      name: agent.name,
      displayName: agent.display_name,
      persona: agent.persona,
      llmProvider: agent.llm_provider || 'dashscope',
      llmModel: agent.llm_model || 'qwen-turbo',
    },
    round,
    maxRounds,
  });

  // Build LLM call function (wraps existing llm-call node)
  const llmCall = async (systemPrompt, userPrompt, options) => {
    const result = await llmCallNode.execute(ctx, {
      agent,
      systemPrompt,
      userPrompt,
      role: agent.role,
      round,
    });
    return result.content;
  };

  // Build prompt
  const contentText = ctx.creativeContent?.content || ctx.questionText || '';
  const contentTitle = ctx.creation?.title || ctx.question?.title || '';
  const userPrompt = buildCritiquePrompt({
    content: contentText,
    contentTitle,
    domain,
    role: agent.role,
    priorResponses: previousResponses,
    agentPersona: agent.persona,
  });

  // Execute with harness (validate + retry + trajectory)
  const harness = new AgentHarness(harnessConfig, llmCall);
  const result = await harness.run(userPrompt);

  if (!result.success) {
    console.warn(`[Harness] ${agent.name} failed after ${result.iterations} iterations: ${result.output?.slice(0, 100)}`);
  }

  // Log trajectory for future analysis (fire-and-forget)
  if (result.trajectory?.length > 0) {
    console.log(`[Harness] ${agent.name} round ${round}: ${result.iterations} iterations, ${result.durationMs}ms`);
  }

  return result.output || '';
}

module.exports = { generateAgentResponse };
