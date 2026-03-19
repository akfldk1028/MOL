/**
 * OpenClaw-RL LLM Provider (OpenAI-compatible API)
 * Proxies to local OpenClaw-Tinker for weight-level RL training.
 * Sends session headers so PRM can score turns automatically.
 */

let _healthy = null; // null = unchecked, true/false = cached result
let _healthCheckInFlight = null; // dedup concurrent checks

async function _checkHealth(baseUrl) {
  if (_healthy !== null) return _healthy;

  // Dedup: if a check is already in flight, wait for it
  if (_healthCheckInFlight) return _healthCheckInFlight;

  _healthCheckInFlight = (async () => {
    try {
      const res = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(5000) });
      _healthy = res.ok;
    } catch {
      _healthy = false;
    }
    // Re-check after 60s (whether healthy or not)
    setTimeout(() => { _healthy = null; }, 60_000);
    _healthCheckInFlight = null;
    return _healthy;
  })();

  return _healthCheckInFlight;
}

module.exports = {
  /**
   * @param {string} model
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {Object} [options]
   * @param {string} [options.sessionId] - OpenClaw session ID for multi-turn RL
   * @param {string} [options.turnType] - 'main' | 'feedback'
   * @param {boolean} [options.sessionDone] - Signal session end to PRM
   * @param {number} [options.maxOutputTokens]
   * @returns {Promise<string>}
   */
  async call(model, systemPrompt, userPrompt, options = {}) {
    const baseUrl = process.env.OPENCLAW_API_URL || 'http://localhost:30000';
    const apiKey = process.env.OPENCLAW_API_KEY;

    // Health check on first call
    const healthy = await _checkHealth(baseUrl);
    if (!healthy) {
      throw new Error(`OpenClaw proxy not reachable at ${baseUrl}. Start openclaw-tinker or set OPENCLAW_ENABLED=false`);
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Session-Id': options.sessionId || 'unknown',
      'X-Turn-Type': options.turnType || 'main',
      'X-Session-Done': options.sessionDone ? '1' : '0',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: options.maxOutputTokens || 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`OpenClaw API error: ${response.status} - ${err.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      throw new Error('OpenClaw returned empty or malformed response');
    }
    return choice.message.content;
  },

  /** Reset health cache (for testing) */
  resetHealth() { _healthy = null; },

  /** Get cached health status */
  getHealthStatus() { return _healthy; },
};
