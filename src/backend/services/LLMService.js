/**
 * LLM Service
 * Multi-provider LLM integration for agent debate responses.
 * Now delegates to nodes/llm-call while maintaining backward compatibility.
 */

const { buildSystemPrompt, buildUserPrompt } = require('../nodes/llm-call/prompt-builder');
const anthropic = require('../nodes/llm-call/providers/anthropic');
const openai = require('../nodes/llm-call/providers/openai');
const google = require('../nodes/llm-call/providers/google');

// 에이전트별 LLM 설정 (kept for backward compat)
const AGENT_LLM_CONFIG = {
  analyst: { provider: 'google', model: 'gemini-2.5-flash-lite' },
  creative: { provider: 'google', model: 'gemini-2.5-flash-lite' },
  critic: { provider: 'google', model: 'gemini-2.5-flash-lite' },
  synthesizer: { provider: 'google', model: 'gemini-2.5-flash-lite' },
  researcher: { provider: 'google', model: 'gemini-2.5-flash-lite' },
};

// 에이전트 페르소나 프롬프트
const AGENT_PERSONAS = {
  analyst: `You are "Analyst", a data-driven, logical, and structured thinker. You approach problems methodically, break them down into components, and provide evidence-based reasoning. You prefer facts over opinions and always structure your responses clearly with supporting arguments.`,
  creative: `You are "Creative", an unconventional and imaginative thinker. You look at problems from unexpected angles, challenge assumptions, and propose novel solutions. You're not afraid to think outside the box and suggest approaches others might overlook.`,
  critic: `You are "Critic", a skeptical and rigorous evaluator. Your role is to play devil's advocate — find flaws in arguments, question assumptions, and identify potential risks or overlooked issues. You keep the discussion honest and thorough.`,
  synthesizer: `You are "Synthesizer", a bridge-builder who finds common ground. You identify patterns across different viewpoints, reconcile contradictions, and create comprehensive summaries that capture the best insights from all perspectives.`,
  researcher: `You are "Researcher", a thorough investigator focused on accuracy and sources. You dig deep into topics, provide context and background, fact-check claims, and reference relevant information to ground the discussion in reality.`,
};

const providers = { anthropic, openai, google };

class LLMService {
  static getAgentConfig(agentName) {
    return AGENT_LLM_CONFIG[agentName] || AGENT_LLM_CONFIG.analyst;
  }

  static getPersona(agentName) {
    return AGENT_PERSONAS[agentName] || AGENT_PERSONAS.analyst;
  }

  /**
   * Generate a response from an LLM provider
   * Delegates to modular provider modules.
   */
  static async generateResponse({ agentName, question, previousResponses = [], round, role }) {
    const llmConfig = this.getAgentConfig(agentName);
    const persona = this.getPersona(agentName);

    const systemPrompt = buildSystemPrompt(persona, role, round);
    const userPrompt = buildUserPrompt(question, previousResponses, round);

    const provider = providers[llmConfig.provider];
    if (!provider) throw new Error(`Unknown LLM provider: ${llmConfig.provider}`);

    return provider.call(llmConfig.model, systemPrompt, userPrompt);
  }

  /**
   * Generate a synthesis/summary response
   */
  static async generateSynthesis({ question, allResponses }) {
    const persona = this.getPersona('synthesizer');
    const llmConfig = this.getAgentConfig('synthesizer');

    const systemPrompt = `${persona}\n\nYour task is to create a comprehensive synthesis of the debate. Identify key agreements, disagreements, and the strongest arguments. Provide a clear, actionable conclusion that addresses the original question. Write in a structured format with clear sections.`;

    const responseSummary = allResponses
      .map((r, i) => `[${r.agentName} (${r.role}, Round ${r.round})]:\n${r.content}`)
      .join('\n\n---\n\n');

    const userPrompt = `Original Question: ${question}\n\nDebate Responses:\n${responseSummary}\n\nPlease synthesize these perspectives into a comprehensive answer.`;

    return anthropic.call(llmConfig.model, systemPrompt, userPrompt);
  }
}

module.exports = LLMService;
