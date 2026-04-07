/**
 * OpenAI-Compatible LLM Provider
 * Works with: DashScope (Qwen), OpenAI (GPT), Anthropic (Claude via proxy), any OpenAI-compatible API
 *
 * Provider configs (set via brain_config.llm_provider):
 *   dashscope → https://dashscope-intl.aliyuncs.com/compatible-mode/v1
 *   openai    → https://api.openai.com/v1
 *   anthropic → https://api.anthropic.com/v1 (Messages API, not OpenAI compat)
 */

const PROVIDER_CONFIGS = {
  dashscope: {
    baseUrl: process.env.DASHSCOPE_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    apiKey: () => process.env.DASHSCOPE_API_KEY || '',
    defaultModel: process.env.DASHSCOPE_MODEL || 'qwen-turbo',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: () => process.env.OPENAI_API_KEY || '',
    defaultModel: 'gpt-4o-mini',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: () => process.env.OPENROUTER_API_KEY || '',
    defaultModel: 'qwen/qwen3.5-flash',
  },
};

module.exports = {
  /**
   * @param {string} model - Model name (e.g. 'qwen-turbo', 'gpt-4o')
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {Object} [options]
   * @param {string} [options.provider] - Provider key (dashscope/openai/openrouter)
   * @param {string} [options.apiKey] - Override API key (for per-agent keys)
   * @param {number} [options.maxOutputTokens]
   * @returns {Promise<string>}
   */
  async call(model, systemPrompt, userPrompt, options = {}) {
    const providerKey = options.provider || 'dashscope';
    const config = PROVIDER_CONFIGS[providerKey];
    if (!config) throw new Error(`Unknown OpenAI-compat provider: ${providerKey}`);

    const apiKey = options.apiKey || config.apiKey();
    if (!apiKey) throw new Error(`API key not configured for provider: ${providerKey}`);

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

    const body = {
      model: model || config.defaultModel,
      messages,
      max_tokens: options.maxOutputTokens || 1024,
    };

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`${providerKey} API error: ${response.status} - ${JSON.stringify(err.error || 'Unknown')}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`Empty response from ${providerKey}`);
    return content.trim();
  },
};
