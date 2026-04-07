/**
 * Structured Output — Zod schema validation + auto-retry for LLM responses.
 * @origin: open-multi-agent/src/agent/structured-output.ts
 */

const { z } = require('zod');

function extractJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }
  return null;
}

function validate(text, schema) {
  const json = extractJSON(text);
  if (!json) return { success: false, error: 'Failed to extract JSON from response' };
  const result = schema.safeParse(json);
  if (result.success) return { success: true, data: result.data };
  const errorMsg = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  return { success: false, error: errorMsg };
}

async function validateAndRetry(llmCall, systemPrompt, userPrompt, schema, options = {}) {
  const maxRetries = options.maxRetries ?? 1;
  let lastRaw = '';
  let lastError = '';
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = attempt === 0
      ? userPrompt
      : `${userPrompt}\n\n[Previous attempt failed validation: ${lastError}]\nPlease fix the JSON output.`;
    lastRaw = await llmCall(systemPrompt, prompt, options.llmOptions || {});
    const result = validate(lastRaw, schema);
    if (result.success) return { success: true, data: result.data, raw: lastRaw, attempts: attempt + 1 };
    lastError = result.error;
  }
  return { success: false, raw: lastRaw, error: lastError, attempts: maxRetries + 1 };
}

module.exports = { extractJSON, validate, validateAndRetry };
