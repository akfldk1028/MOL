/**
 * harness-base.js
 * ---------------
 * Common runner interface for action-domain harnesses.
 *
 * Each action domain has a Harness class that orchestrates the actual
 * execution: loads agents, builds prompts, calls LLM, validates output,
 * handles retries, writes to CGB.
 *
 * Subclasses (NegotiationHarness, AnalysisHarness) implement `run()`.
 *
 * Provides shared utilities:
 *   - LLM call wrapper (via openai-compat provider)
 *   - BrainClient memory injection
 *   - CGB node/edge recording
 *   - JSON action parsing
 */

const openaiCompat = require('../../nodes/llm-call/providers/openai-compat');

class HarnessBase {
  /**
   * @param {object} params
   * @param {string} params.domain    - action-domain slug
   * @param {object} params.config    - parsed domain.json
   * @param {Function} [params.llmCall] - injectable LLM caller (for testing)
   */
  constructor({ domain, config, llmCall = null } = {}) {
    if (!domain) throw new Error('HarnessBase: domain is required');
    if (!config) throw new Error('HarnessBase: config is required');
    this.domain = domain;
    this.config = config;
    this._llmCall = llmCall;
  }

  /**
   * MUST be overridden by subclass.
   * Executes the full session lifecycle and returns a result.
   * @param {SessionBase} session
   * @param {object} input - domain-specific input
   * @returns {Promise<any>}
   */
  async run(session, input) {
    throw new Error(`${this.constructor.name}.run(): not implemented`);
  }

  /**
   * LLM call — uses injected llmCall or defaults to DashScope qwen-turbo.
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {object} [options]
   * @returns {Promise<string>}
   */
  async llmCall(systemPrompt, userPrompt, options = {}) {
    if (this._llmCall) return this._llmCall(systemPrompt, userPrompt, options);

    const model = options.model || process.env.DASHSCOPE_MODEL || 'qwen-turbo';
    return openaiCompat.call(model, systemPrompt, userPrompt, {
      provider: 'dashscope',
      maxOutputTokens: options.maxOutputTokens || 1024,
      ...options,
    });
  }

  /**
   * Parse a JSON action from LLM output.
   * LLMs often wrap JSON in markdown code fences — strip them.
   * @param {string} raw
   * @returns {object|null}
   */
  parseJsonAction(raw) {
    if (!raw || typeof raw !== 'string') return null;

    // Strip markdown code fences
    let text = raw.trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) text = fenced[1].trim();

    // Extract first JSON object
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  /**
   * Inject agent memory into a prompt (via BrainClient.getAgentMemory).
   * Falls back gracefully if BrainClient is unavailable.
   * @param {string} agentId
   * @param {object} [options]
   * @returns {Promise<string>}
   */
  async injectMemory(agentId, options = {}) {
    try {
      const BrainClient = require('../../services/BrainClient');
      const memory = await BrainClient.getAgentMemory(agentId, options);
      return memory || '';
    } catch {
      return '';
    }
  }

  /**
   * Record a session event to CGB (as a Proposal, Plan, Insight node etc.).
   * Fire-and-forget — failures don't block the harness.
   * @param {string} nodeType
   * @param {object} nodeData
   */
  async recordToCGB(nodeType, nodeData) {
    try {
      const BrainClient = require('../../services/BrainClient');
      if (typeof BrainClient.addToGraph === 'function' && nodeData.agent_id) {
        await BrainClient.addToGraph(nodeData.agent_id, { type: nodeType, ...nodeData });
      }
    } catch (err) {
      console.warn(`[${this.constructor.name}] recordToCGB(${nodeType}) failed:`, err.message);
    }
  }

  /**
   * Retry an async operation up to `maxAttempts` times with linear backoff.
   * @param {Function} fn - async operation returning { ok, value, errors }
   * @param {number} maxAttempts
   * @returns {Promise<{ ok, value, errors, attempts }>}
   */
  async retry(fn, maxAttempts = 2) {
    let last = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await fn(attempt);
      if (result && result.ok) {
        return { ...result, attempts: attempt };
      }
      last = result;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    return { ...(last || { ok: false, errors: ['no result'] }), attempts: maxAttempts };
  }
}

module.exports = {
  HarnessBase,
};
