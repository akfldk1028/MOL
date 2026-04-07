/**
 * LLM Service
 * Multi-provider LLM integration for agent debate responses.
 * Now delegates to nodes/llm-call while maintaining backward compatibility.
 */

const { buildSystemPrompt, buildUserPrompt } = require('../nodes/llm-call/prompt-builder');
const anthropic = require('../nodes/llm-call/providers/anthropic');
const openai = require('../nodes/llm-call/providers/openai');
const google = require('../nodes/llm-call/providers/google');
const openaiCompat = require('../nodes/llm-call/providers/openai-compat');

// 기본 LLM — DashScope 최저가 (brain_config에서 오버라이드 가능)
const DEFAULT_LLM_CONFIG = {
  provider: 'openai-compat',
  model: process.env.DASHSCOPE_MODEL || 'qwen-turbo',
  openaiCompatProvider: 'dashscope',
};

// fallback: DashScope 키 없으면 Gemini
const FALLBACK_LLM_CONFIG = {
  provider: 'google',
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
};

// 에이전트 페르소나 프롬프트
const AGENT_PERSONAS = {
  analyst: `You are "Analyst", a data-driven, logical, and structured thinker. You approach problems methodically, break them down into components, and provide evidence-based reasoning. You prefer facts over opinions and always structure your responses clearly with supporting arguments.`,
  creative: `You are "Creative", an unconventional and imaginative thinker. You look at problems from unexpected angles, challenge assumptions, and propose novel solutions. You're not afraid to think outside the box and suggest approaches others might overlook.`,
  critic: `You are "Critic", a skeptical and rigorous evaluator. Your role is to play devil's advocate — find flaws in arguments, question assumptions, and identify potential risks or overlooked issues. You keep the discussion honest and thorough.`,
  synthesizer: `You are "Synthesizer", a bridge-builder who finds common ground. You identify patterns across different viewpoints, reconcile contradictions, and create comprehensive summaries that capture the best insights from all perspectives.`,
  researcher: `You are "Researcher", a thorough investigator focused on accuracy and sources. You dig deep into topics, provide context and background, fact-check claims, and reference relevant information to ground the discussion in reality.`,
};

const providers = { anthropic, openai, google, 'openai-compat': openaiCompat };

class LLMService {
  /**
   * Get LLM config — from brain_config if available, else default DashScope/Gemini
   * @param {string} agentName
   * @param {Object} [brainConfig] - agent.brain_config from DB
   */
  static getAgentConfig(agentName, brainConfig) {
    // brain_config에 llm_provider 있으면 우선
    if (brainConfig?.llm_provider && brainConfig.llm_provider !== 'dashscope') {
      // GPT, Claude 등 외부 provider
      return {
        provider: 'openai-compat',
        model: brainConfig.llm_model || 'gpt-4o-mini',
        openaiCompatProvider: brainConfig.llm_provider,
        apiKey: brainConfig.llm_api_key, // 유저가 자기 키 넣은 경우
      };
    }
    // DashScope 기본
    if (process.env.DASHSCOPE_API_KEY) {
      return {
        ...DEFAULT_LLM_CONFIG,
        model: brainConfig?.llm_content_model || brainConfig?.llm_model || DEFAULT_LLM_CONFIG.model,
      };
    }
    // fallback: Gemini
    return FALLBACK_LLM_CONFIG;
  }

  static getPersona(agentName) {
    return AGENT_PERSONAS[agentName] || AGENT_PERSONAS.analyst;
  }

  /**
   * Generate a response from an LLM provider
   * Delegates to modular provider modules.
   */
  static async generateResponse({ agentName, question, previousResponses = [], round, role, brainConfig }) {
    const llmConfig = this.getAgentConfig(agentName, brainConfig);
    const persona = this.getPersona(agentName);

    const systemPrompt = buildSystemPrompt(persona, role, round);
    const userPrompt = buildUserPrompt(question, previousResponses, round);

    const provider = providers[llmConfig.provider];
    if (!provider) throw new Error(`Unknown LLM provider: ${llmConfig.provider}`);

    const options = {};
    if (llmConfig.openaiCompatProvider) options.provider = llmConfig.openaiCompatProvider;
    if (llmConfig.apiKey) options.apiKey = llmConfig.apiKey;

    return provider.call(llmConfig.model, systemPrompt, userPrompt, options);
  }

  /**
   * Generate a synthesis/summary response
   */
  static async generateSynthesis({ question, allResponses, brainConfig }) {
    const persona = this.getPersona('synthesizer');
    const llmConfig = this.getAgentConfig('synthesizer', brainConfig);

    const systemPrompt = `${persona}\n\nYour task is to create a comprehensive synthesis of the debate. Identify key agreements, disagreements, and the strongest arguments. Provide a clear, actionable conclusion that addresses the original question. Write in a structured format with clear sections.`;

    const responseSummary = allResponses
      .map((r, i) => `[${r.agentName} (${r.role}, Round ${r.round})]:\n${r.content}`)
      .join('\n\n---\n\n');

    const userPrompt = `Original Question: ${question}\n\nDebate Responses:\n${responseSummary}\n\nPlease synthesize these perspectives into a comprehensive answer.`;

    const provider = providers[llmConfig.provider];
    const options = {};
    if (llmConfig.openaiCompatProvider) options.provider = llmConfig.openaiCompatProvider;
    if (llmConfig.apiKey) options.apiKey = llmConfig.apiKey;

    return provider.call(llmConfig.model, systemPrompt, userPrompt, options);
  }
}

module.exports = LLMService;
