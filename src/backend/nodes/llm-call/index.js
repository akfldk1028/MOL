/**
 * Node: llm-call
 * Calls an LLM provider (Anthropic, OpenAI, Google) with agent persona.
 * Extracted from LLMService.generateResponse.
 */

const { buildSystemPrompt, buildUserPrompt } = require('./prompt-builder');
const { buildCritiqueSystemPrompt, buildCritiqueUserPrompt } = require('./critique-prompt-builder');
const anthropic = require('./providers/anthropic');
const openai = require('./providers/openai');
const google = require('./providers/google');
const groq = require('./providers/groq');
const deepseek = require('./providers/deepseek');

const providers = { anthropic, openai, google, groq, deepseek };

module.exports = {
  type: 'llm-call',
  name: 'LLM Call',
  description: 'Call an LLM provider with agent persona',

  /**
   * @param {import('../../engine/WorkflowContext')} ctx
   * @param {Object} config
   * @param {Object} config.agent - Agent object with llm_provider, llm_model, persona
   * @param {string} config.systemPrompt - Pre-built system prompt (optional)
   * @param {string} config.userPrompt - Pre-built user prompt (optional)
   * @param {string} config.role - Agent role
   * @param {number} config.round - Current round
   * @param {Array} config.previousResponses - Previous responses for context
   * @returns {Promise<{content: string}>}
   */
  async execute(ctx, config = {}) {
    const { agent, role, round, previousResponses = [] } = config;
    if (!agent) throw new Error('llm-call requires config.agent');

    const persona = agent.persona || '';
    const provider = agent.llm_provider || 'anthropic';
    const model = agent.llm_model || 'claude-sonnet-4-6';

    // Use critique prompts when creative content is present
    let systemPrompt, userPrompt;
    if (config.systemPrompt) {
      systemPrompt = config.systemPrompt;
    } else if (ctx.isCritique) {
      systemPrompt = buildCritiqueSystemPrompt(persona, role, round, ctx.domainConfig, ctx.creativeContent || {});
    } else {
      systemPrompt = buildSystemPrompt(persona, role, round, ctx.domainConfig);
    }

    if (config.userPrompt) {
      userPrompt = config.userPrompt;
    } else if (ctx.isCritique) {
      userPrompt = buildCritiqueUserPrompt(ctx.questionText, previousResponses, round, ctx.creativeContent || {});
    } else {
      userPrompt = buildUserPrompt(ctx.questionText, previousResponses, round);
    }

    const providerFn = providers[provider];
    if (!providerFn) throw new Error(`Unknown LLM provider: "${provider}"`);

    // Pass image URLs for multimodal content (webtoon panels, etc.)
    const options = {};
    if (ctx.imageUrls?.length > 0) {
      options.imageUrls = ctx.imageUrls;
    }

    const content = await providerFn.call(model, systemPrompt, userPrompt, options);
    return { content };
  },
};
