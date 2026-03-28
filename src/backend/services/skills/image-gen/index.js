/**
 * Image Generation Skill
 *
 * Generates images via:
 *   1. Google Gemini (Nano Banana) — preferred, uses GOOGLE_AI_API_KEY
 *   2. OpenAI Images API (DALL-E 3, GPT-image-1) — fallback
 *
 * Used by illustration/webtoon agents for cover art, concept images, panels.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ── Gemini (Nano Banana) ──

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Official model names (2026-03): gemini-3.1-flash-image-preview (fast), gemini-3-pro-image-preview (quality)
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';

const GEMINI_ASPECTS = ['1:1', '1:4', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

/**
 * Generate image via Gemini (Nano Banana)
 * @param {object} opts
 * @param {string} opts.prompt - Image description
 * @param {string} [opts.aspectRatio='3:4'] - Aspect ratio
 * @param {string[]} [opts.referenceImageUrls] - Reference images for style/character consistency
 * @returns {Promise<{ images: Array<{ b64: string, mimeType: string }> }>}
 */
async function generateGemini(opts = {}) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set');

  const aspect = GEMINI_ASPECTS.includes(opts.aspectRatio) ? opts.aspectRatio : '3:4';

  // Build content parts
  const parts = [{ text: opts.prompt }];

  // Add reference images for character consistency (Nano Banana feature)
  if (opts.referenceImageUrls?.length > 0) {
    for (const url of opts.referenceImageUrls.slice(0, 3)) {
      const imgData = await _fetchImageAsBase64(url);
      if (imgData) {
        parts.push({ inlineData: { mimeType: imgData.mimeType, data: imgData.data } });
      }
    }
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      maxOutputTokens: 4096,
      imageConfig: {
        aspectRatio: aspect,
      },
    },
  };

  const response = await fetch(
    `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini Image API error: ${response.status} - ${JSON.stringify(err.error || 'Unknown')}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts) {
    throw new Error('Gemini returned no image content');
  }

  const images = [];
  let responseText = '';

  for (const part of candidate.content.parts) {
    if (part.inlineData) {
      images.push({
        b64: part.inlineData.data,
        mimeType: part.inlineData.mimeType || 'image/png',
      });
    } else if (part.text) {
      responseText = part.text;
    }
  }

  if (images.length === 0) {
    throw new Error(`Gemini returned no images. Text response: ${responseText.slice(0, 200)}`);
  }

  return { images, responseText };
}

/**
 * Save Gemini b64 image to temp file and return path
 */
function saveB64ToTemp(b64, mimeType) {
  const ext = mimeType === 'image/jpeg' ? '.jpg' : '.png';
  const tmpPath = path.join(os.tmpdir(), `nanobanan-${crypto.randomUUID()}${ext}`);
  const buffer = Buffer.from(b64, 'base64');
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

// ── OpenAI (DALL-E) fallback ──

const OPENAI_MODELS = {
  'gpt-image-1': { sizes: ['1024x1024', '1536x1024', '1024x1536'], defaultQuality: 'high' },
  'dall-e-3': { sizes: ['1024x1024', '1792x1024', '1024x1792'], defaultQuality: 'standard', maxCount: 1 },
  'dall-e-2': { sizes: ['256x256', '512x512', '1024x1024'], defaultQuality: 'standard' },
};

async function generateOpenAI(opts = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const model = opts.model || 'dall-e-3';
  const modelConfig = OPENAI_MODELS[model] || OPENAI_MODELS['dall-e-3'];
  const size = opts.size || '1024x1024';
  const quality = opts.quality || modelConfig.defaultQuality;
  const count = modelConfig.maxCount ? Math.min(opts.count || 1, modelConfig.maxCount) : (opts.count || 1);

  const body = { model, prompt: opts.prompt, size, n: count };
  if (model !== 'dall-e-2') body.quality = quality;
  if (model === 'dall-e-3' && opts.style) body.style = opts.style;

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI Images API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  if (!Array.isArray(data.data) || data.data.length === 0) {
    throw new Error('OpenAI Images API returned no images');
  }

  return {
    images: data.data.map(d => ({
      url: d.url || null,
      b64: d.b64_json || null,
      revisedPrompt: d.revised_prompt || null,
    })),
  };
}

// ── Unified generate: Gemini first, OpenAI fallback ──

/**
 * Generate image(s) — tries Gemini (Nano Banana) first, falls back to OpenAI
 * @param {object} opts
 * @param {string} opts.prompt - Image description
 * @param {string} [opts.aspectRatio] - For Gemini: aspect ratio
 * @param {string} [opts.size] - For OpenAI: image size
 * @param {string} [opts.style] - For OpenAI: vivid/natural
 * @param {string} [opts.model] - Force specific OpenAI model
 * @param {string[]} [opts.referenceImageUrls] - For Gemini: reference images
 * @param {string} [opts.provider] - Force 'gemini' or 'openai'
 * @returns {Promise<{ images: Array, provider: string, responseText?: string }>}
 */
async function generate(opts = {}) {
  const forceProvider = opts.provider;

  // Try Gemini first (free with GOOGLE_AI_API_KEY)
  if (forceProvider !== 'openai' && process.env.GOOGLE_AI_API_KEY) {
    try {
      const result = await generateGemini(opts);
      return { ...result, provider: 'gemini' };
    } catch (err) {
      console.warn(`image-gen: Gemini failed, trying OpenAI fallback:`, err.message);
      if (forceProvider === 'gemini') throw err;
    }
  }

  // OpenAI fallback
  if (forceProvider !== 'gemini' && process.env.OPENAI_API_KEY) {
    const result = await generateOpenAI(opts);
    return { ...result, provider: 'openai' };
  }

  throw new Error('No image generation API key available (need GOOGLE_AI_API_KEY or OPENAI_API_KEY)');
}

/**
 * Resolve skill config for agents
 */
function resolve() {
  const geminiAvailable = !!process.env.GOOGLE_AI_API_KEY;
  const openaiAvailable = !!process.env.OPENAI_API_KEY;
  return {
    available: geminiAvailable || openaiAvailable,
    provider: geminiAvailable ? 'gemini' : openaiAvailable ? 'openai' : null,
    skillHint: geminiAvailable
      ? 'You can generate images using Nano Banana (Gemini). Describe what you want to create. You can maintain character consistency across multiple images.'
      : 'You can generate images using the image generation skill. Describe what you want to create in detail.',
  };
}

// ── Utils ──

async function _fetchImageAsBase64(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn(`image-gen: reference image fetch failed (${res.status}): ${url.substring(0, 100)}`);
      return null;
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > 4 * 1024 * 1024) {
      console.warn(`image-gen: reference image too large (${Math.round(buffer.byteLength / 1024)}KB): ${url.substring(0, 100)}`);
      return null;
    }
    return { mimeType: contentType.split(';')[0], data: Buffer.from(buffer).toString('base64') };
  } catch (err) {
    console.warn(`image-gen: reference image fetch error: ${err.message} — ${url.substring(0, 100)}`);
    return null;
  }
}

module.exports = {
  generate,
  generateGemini,
  generateOpenAI,
  saveB64ToTemp,
  resolve,
  GEMINI_ASPECTS,
  OPENAI_MODELS,
};
