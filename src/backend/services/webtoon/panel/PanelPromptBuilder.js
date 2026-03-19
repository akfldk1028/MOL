/**
 * PanelPromptBuilder — Build image generation prompts for each panel
 *
 * Takes parsed panel data + character references and builds optimized prompts.
 * Applies StoryDiffusion-inspired spatial attention cues at the prompt level.
 */

const StylePromptEnhancer = require('../style/StylePromptEnhancer');

class PanelPromptBuilder {
  /**
   * Build image-gen prompts for all panels
   * @param {Array<ParsedPanel>} panels - Panels with layout assignments
   * @param {Array<{ name, referenceImageUrl, description }>} characters - Character sheets
   * @param {{ genre?: string, stylePreset?: string }} seriesContext
   * @returns {Array<{ prompt: string, aspectRatio: string, referenceImageUrls: string[] }>}
   */
  static buildAll(panels, characters, seriesContext = {}) {
    const charMap = new Map(characters.map(c => [c.name.toLowerCase(), c]));
    let prevPanelHint = '';

    return panels.map((panel, idx) => {
      const result = this._buildSingle(panel, idx, panels.length, charMap, seriesContext, prevPanelHint);
      // Pass scene hint to next panel for continuity
      prevPanelHint = panel.sceneDescription.slice(0, 100);
      return result;
    });
  }

  /**
   * Build prompt for a single panel
   */
  static _buildSingle(panel, panelIdx, totalPanels, charMap, seriesContext, prevPanelHint) {
    const parts = [];

    // 1. Style prefix from preset or genre
    const stylePrefix = StylePromptEnhancer.getPrefix(seriesContext.stylePreset, seriesContext.genre);
    parts.push(stylePrefix);

    // 2. Camera angle hint (StoryDiffusion-inspired spatial cue)
    if (panel.cameraAngle && panel.cameraAngle !== 'standard') {
      parts.push(`${panel.cameraAngle},`);
    }

    // 3. Character descriptions injected into scene
    const matchedChars = [];
    const refUrls = [];
    for (const charName of panel.characters) {
      const charData = charMap.get(charName.toLowerCase());
      if (charData) {
        matchedChars.push(charData);
        refUrls.push(charData.referenceImageUrl);
      }
    }

    // If characters found in sheets, inject their full descriptions
    if (matchedChars.length > 0) {
      const charDescs = matchedChars
        .map(c => `[${c.name}: ${c.description}]`)
        .join(' ');
      parts.push(charDescs);
    }

    // 4. Original scene description (already detailed from LLM)
    parts.push(panel.sceneDescription);

    // 5. Continuity hint from previous panel
    if (prevPanelHint && panelIdx > 0) {
      parts.push(`Continuing from previous scene: ${prevPanelHint}.`);
    }

    // 6. Style suffix
    const styleSuffix = StylePromptEnhancer.getSuffix(seriesContext.stylePreset);
    if (styleSuffix) parts.push(styleSuffix);

    // Also include legacy character_reference_urls if no character sheets
    // The caller handles merging with series.character_reference_urls

    return {
      prompt: parts.filter(Boolean).join(' '),
      aspectRatio: panel.aspectRatio || '9:16',
      referenceImageUrls: refUrls,
      emphasis: panel.emphasis,
      dialogue: panel.dialogue,
    };
  }
}

module.exports = PanelPromptBuilder;
