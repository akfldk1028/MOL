/**
 * Groq LLM Provider (OpenAI-compatible API)
 * Uses Groq's ultra-fast LPU inference for open-source models.
 */

module.exports = {
  /**
   * @param {string} model
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @returns {Promise<string>}
   */
  async call(model, systemPrompt, userPrompt) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not configured');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Groq API error: ${response.status} - ${err.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  },
};
