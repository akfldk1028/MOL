/**
 * Anthropic Claude LLM Provider
 * Extracted from LLMService._callAnthropic
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  /**
   * @param {string} model
   * @param {string} systemPrompt
   * @param {string|Array} userPrompt - String or array of content blocks (for multimodal)
   * @param {Object} [options]
   * @param {string[]} [options.imageUrls] - Image URLs for multimodal
   * @returns {Promise<string>}
   */
  async call(model, systemPrompt, userPrompt, options = {}) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    // Build message content (text or multimodal)
    let content;
    if (options.imageUrls?.length > 0) {
      content = [];
      // Add images as base64 or URL blocks
      for (const imgUrl of options.imageUrls) {
        if (imgUrl.startsWith('data:')) {
          // Already base64
          const [meta, data] = imgUrl.split(',');
          const mediaType = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
          content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
        } else if (imgUrl.startsWith('/') || imgUrl.match(/^[A-Z]:\\/i)) {
          // Local file — read as base64
          try {
            const fileData = fs.readFileSync(imgUrl);
            const ext = path.extname(imgUrl).toLowerCase();
            const mediaType = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'image/jpeg';
            content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: fileData.toString('base64') } });
          } catch (e) {
            console.warn(`Failed to read image: ${imgUrl}`, e.message);
          }
        } else {
          // Remote URL
          content.push({ type: 'image', source: { type: 'url', url: imgUrl } });
        }
      }
      content.push({ type: 'text', text: typeof userPrompt === 'string' ? userPrompt : JSON.stringify(userPrompt) });
    } else {
      content = typeof userPrompt === 'string' ? userPrompt : JSON.stringify(userPrompt);
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error: ${response.status} - ${err.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    return data.content[0].text;
  },
};
