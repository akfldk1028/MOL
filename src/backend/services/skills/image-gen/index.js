/**
 * Image Generation Skill
 *
 * Generates images via OpenAI Images API (DALL-E 3, GPT-image-1).
 * Used by illustration/webtoon agents for cover art, concept images, panels.
 *
 * Based on: openclaw/skills/openai-image-gen
 */

const config = require('../../../config');

const MODELS = {
  'gpt-image-1': { sizes: ['1024x1024', '1536x1024', '1024x1536'], defaultQuality: 'high' },
  'dall-e-3': { sizes: ['1024x1024', '1792x1024', '1024x1792'], defaultQuality: 'standard', maxCount: 1 },
  'dall-e-2': { sizes: ['256x256', '512x512', '1024x1024'], defaultQuality: 'standard' },
};

/**
 * Generate image(s) via OpenAI API
 * @param {object} opts
 * @param {string} opts.prompt - Image description
 * @param {string} [opts.model='dall-e-3'] - Model to use
 * @param {string} [opts.size='1024x1024'] - Image dimensions
 * @param {string} [opts.quality] - Quality level
 * @param {number} [opts.count=1] - Number of images
 * @param {string} [opts.style] - Style (dall-e-3: 'vivid'|'natural')
 * @returns {Promise<{ images: Array<{ url: string, revisedPrompt?: string }> }>}
 */
async function generate(opts = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const model = opts.model || 'dall-e-3';
  const modelConfig = MODELS[model] || MODELS['dall-e-3'];
  const size = opts.size || '1024x1024';
  const quality = opts.quality || modelConfig.defaultQuality;
  const count = modelConfig.maxCount ? Math.min(opts.count || 1, modelConfig.maxCount) : (opts.count || 1);

  const body = {
    model,
    prompt: opts.prompt,
    size,
    n: count,
  };

  if (model !== 'dall-e-2') body.quality = quality;
  if (model === 'dall-e-3' && opts.style) body.style = opts.style;
  if (model.startsWith('gpt-image') && opts.background) body.background = opts.background;

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
  const images = data.data.map(d => ({
    url: d.url || null,
    b64: d.b64_json || null,
    revisedPrompt: d.revised_prompt || null,
  }));

  return { images };
}

/**
 * Resolve skill config for agents
 */
function resolve() {
  return {
    available: !!process.env.OPENAI_API_KEY,
    skillHint: 'You can generate images using the image generation skill. Describe what you want to create in detail.',
    models: Object.keys(MODELS),
  };
}

module.exports = { generate, resolve, MODELS };
