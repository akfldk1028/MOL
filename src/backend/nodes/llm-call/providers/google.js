/**
 * Google Gemini LLM Provider
 * Extracted from LLMService._callGoogle
 */

module.exports = {
  /**
   * @param {string} model
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @returns {Promise<string>}
   */
  async call(model, systemPrompt, userPrompt) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Google AI API error: ${response.status} - ${JSON.stringify(err.error || 'Unknown')}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  },
};
