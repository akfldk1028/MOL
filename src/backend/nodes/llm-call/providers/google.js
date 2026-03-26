/**
 * Google Gemini LLM Provider
 *
 * Supports:
 *   - Plain text generation
 *   - Built-in tools: google_search, code_execution (server-side, no loop needed)
 *   - Custom tools: functionDeclarations → function calling loop
 *   - Multimodal: image URLs for vision
 *   - Structured output via response_schema
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const { execute: executeFn, MAX_CALLS_PER_TURN } = require('../../../services/skills/function-executor');

module.exports = {
  /**
   * @param {string} model
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {Object} [options]
   * @param {string[]} [options.imageUrls] - Image URLs for vision
   * @param {Array} [options.tools] - Gemini tool declarations (googleSearch, codeExecution, functionDeclarations)
   * @param {number} [options.maxOutputTokens] - Override max tokens (default 1024)
   * @returns {Promise<string>} Extracted text content
   */
  async call(model, systemPrompt, userPrompt, options = {}) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured');

    // Build user content parts
    const userParts = [{ text: userPrompt }];

    // Add images for vision (webtoon panels, etc.)
    if (options.imageUrls?.length > 0) {
      const imagePromises = options.imageUrls.slice(0, 5).map(url => _fetchImageAsBase64(url));
      const images = await Promise.allSettled(imagePromises);
      for (const result of images) {
        if (result.status === 'fulfilled' && result.value) {
          userParts.push({
            inlineData: { mimeType: result.value.mimeType, data: result.value.data },
          });
        }
      }
    }

    // Build request body
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: userParts }],
      generationConfig: {
        maxOutputTokens: options.maxOutputTokens || 1024,
      },
    };

    // Add tools if specified
    // Gemini API does not allow built-in tools (googleSearch, codeExecution)
    // and functionDeclarations in the same request — separate them.
    if (options.tools?.length > 0) {
      const builtIn = options.tools.filter(t => t.googleSearch || t.codeExecution);
      const funcDecl = options.tools.filter(t => t.functionDeclarations);
      // If both exist, prefer functionDeclarations (drop built-in)
      body.tools = funcDecl.length > 0 ? funcDecl : builtIn;
    }

    // Add response schema if specified (structured output)
    if (options.responseSchema) {
      body.generationConfig.responseMimeType = 'application/json';
      body.generationConfig.responseSchema = options.responseSchema;
    }

    // ── First API call ──
    let data = await _apiCall(model, body, apiKey);

    // ── Function calling loop ──
    // If model returns functionCall parts, execute them and send results back
    let callCount = 0;
    while (callCount < MAX_CALLS_PER_TURN) {
      const functionCalls = _extractFunctionCalls(data);
      if (functionCalls.length === 0) break;

      callCount++;

      // Add model's response (with functionCall) to conversation
      const modelContent = data.candidates[0].content;
      body.contents.push(modelContent);

      // Execute each function call and build response parts
      const responseParts = [];
      for (const fc of functionCalls) {
        console.log(`Gemini functionCall: ${fc.name}(${JSON.stringify(fc.args).slice(0, 100)})`);
        const result = await executeFn(fc.name, fc.args);
        responseParts.push({
          functionResponse: { name: fc.name, response: result },
        });
      }

      // Send function results back to model
      body.contents.push({ role: 'user', parts: responseParts });
      data = await _apiCall(model, body, apiKey);
    }

    return _extractContent(data);
  },
};

/**
 * Make a single API call to Gemini
 */
async function _apiCall(model, body, apiKey) {
  const response = await fetch(
    `${API_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Google AI API error: ${response.status} - ${JSON.stringify(err.error || 'Unknown')}`);
  }

  return response.json();
}

/**
 * Extract functionCall parts from Gemini response
 */
function _extractFunctionCalls(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts
    .filter(p => p.functionCall)
    .map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));
}

/**
 * Extract text content from Gemini response.
 * Handles multi-part responses (text + code execution results + grounding).
 */
function _extractContent(data) {
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts) {
    throw new Error('Empty response from Gemini');
  }

  const parts = candidate.content.parts;
  const textParts = [];

  let hasText = false;
  for (const part of parts) {
    if (part.text) {
      textParts.push(part.text);
      hasText = true;
    } else if (part.executableCode) {
      // Code execution ran — the model's text parts usually explain the result
    } else if (part.codeExecutionResult) {
      if (part.codeExecutionResult.outcome === 'OUTCOME_OK' && part.codeExecutionResult.output) {
        if (!hasText) {
          textParts.push(part.codeExecutionResult.output);
        }
      }
    }
    // functionCall parts are handled by the loop above, not here
  }

  // Append grounding sources if available
  const grounding = candidate.groundingMetadata;
  if (grounding?.groundingChunks?.length > 0) {
    const sources = grounding.groundingChunks
      .filter(c => c.web?.uri)
      .map(c => `[${c.web.title || 'Source'}](${c.web.uri})`)
      .slice(0, 3);
    if (sources.length > 0) {
      textParts.push(`\n\n*Sources: ${sources.join(', ')}*`);
    }
  }

  return textParts.join('\n').trim();
}

/**
 * Fetch a public image URL and return as base64 for Gemini inlineData.
 * Returns null on failure (non-blocking — agent still generates text).
 */
async function _fetchImageAsBase64(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || _guessMimeType(url);
    const buffer = await res.arrayBuffer();

    // Skip images larger than 4MB (Gemini inlineData limit)
    if (buffer.byteLength > 4 * 1024 * 1024) return null;

    const data = Buffer.from(buffer).toString('base64');
    return { mimeType: contentType.split(';')[0], data };
  } catch {
    return null;
  }
}

function _guessMimeType(url) {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.gif')) return 'image/gif';
  if (lower.includes('.webp')) return 'image/webp';
  return 'image/jpeg';
}
