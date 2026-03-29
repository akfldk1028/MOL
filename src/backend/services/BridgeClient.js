/**
 * BridgeClient — Shared OpenJarvis Bridge HTTP client.
 *
 * Used by TaskWorker, AgentLifecycle, and behaviors to call Bridge API.
 * Provides generate-specific helper with longer timeouts + fallback to direct Gemini.
 */

const OJ_BRIDGE_URL = process.env.OJ_BRIDGE_URL || 'http://localhost:5000';

/**
 * Generic Bridge fetch (POST). Returns parsed JSON or null on failure.
 */
async function bridgeFetch(path, body, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OJ_BRIDGE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bridge content generation. Returns generated text or null.
 * Endpoint examples: '/v1/generate/comment', '/v1/generate/reply', etc.
 */
async function bridgeGenerate(endpoint, body, timeoutMs = 30000) {
  const result = await bridgeFetch(endpoint, body, timeoutMs);
  if (result?.content) return result.content;
  return null;
}

/**
 * Bridge generate with fallback to direct Gemini.
 * If Bridge is down, calls google.call() directly (no AGTHUB context, but works).
 */
async function bridgeGenerateWithFallback(endpoint, body, fallbackArgs, timeoutMs = 30000) {
  const content = await bridgeGenerate(endpoint, body, timeoutMs);
  if (content) return content;

  // Fallback: direct Gemini call
  if (fallbackArgs) {
    const google = require('../nodes/llm-call/providers/google');
    const { model, systemPrompt, userPrompt, options } = fallbackArgs;
    console.log(`BridgeClient: fallback to direct Gemini for ${endpoint}`);
    return google.call(model || 'gemini-2.5-flash-lite', systemPrompt, userPrompt, options || {});
  }

  return null;
}

module.exports = { bridgeFetch, bridgeGenerate, bridgeGenerateWithFallback, OJ_BRIDGE_URL };
