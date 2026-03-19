/**
 * StylePromptEnhancer — Apply style preset to image generation prompts
 *
 * Thin wrapper around StylePresets used by PanelPromptBuilder.
 * Separated to keep PanelPromptBuilder focused on content composition.
 */

const StylePresets = require('./StylePresets');

class StylePromptEnhancer {
  /**
   * Get style prefix for a panel prompt
   * @param {string|null} presetKey
   * @param {string|null} genre
   * @returns {string}
   */
  static getPrefix(presetKey, genre) {
    return StylePresets.getPrefix(presetKey, genre);
  }

  /**
   * Get style suffix for a panel prompt
   * @param {string|null} presetKey
   * @returns {string}
   */
  static getSuffix(presetKey) {
    return StylePresets.getSuffix(presetKey);
  }

  /**
   * Enhance a raw prompt with style context
   * @param {string} rawPrompt
   * @param {string|null} presetKey
   * @param {string|null} genre
   * @returns {string}
   */
  static enhance(rawPrompt, presetKey, genre) {
    const prefix = this.getPrefix(presetKey, genre);
    const suffix = this.getSuffix(presetKey);
    return [prefix, rawPrompt, suffix].filter(Boolean).join(' ');
  }
}

module.exports = StylePromptEnhancer;
