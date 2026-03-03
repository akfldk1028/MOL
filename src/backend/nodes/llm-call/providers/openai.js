/**
 * OpenAI GPT LLM Provider
 * Extracted from LLMService._callOpenAI
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  /**
   * @param {string} model
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {Object} [options]
   * @param {string[]} [options.imageUrls] - Image URLs for multimodal
   * @returns {Promise<string>}
   */
  async call(model, systemPrompt, userPrompt, options = {}) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    // Build user message content (text or multimodal)
    let userContent;
    if (options.imageUrls?.length > 0) {
      userContent = [];
      for (const imgUrl of options.imageUrls) {
        if (imgUrl.startsWith('data:')) {
          userContent.push({ type: 'image_url', image_url: { url: imgUrl } });
        } else if (imgUrl.startsWith('/') || imgUrl.match(/^[A-Z]:\\/i)) {
          // Local file — convert to data URL
          try {
            const fileData = fs.readFileSync(imgUrl);
            const ext = path.extname(imgUrl).toLowerCase();
            const mimeType = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'image/jpeg';
            const dataUrl = `data:${mimeType};base64,${fileData.toString('base64')}`;
            userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
          } catch (e) {
            console.warn(`Failed to read image: ${imgUrl}`, e.message);
          }
        } else {
          userContent.push({ type: 'image_url', image_url: { url: imgUrl } });
        }
      }
      userContent.push({ type: 'text', text: typeof userPrompt === 'string' ? userPrompt : JSON.stringify(userPrompt) });
    } else {
      userContent = userPrompt;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} - ${err.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  },
};
