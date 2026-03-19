/**
 * CharacterExtractor — Extract characters from first episode and save to series_characters
 *
 * After the first episode is generated, asks LLM to identify main characters
 * from the panel descriptions, then saves them with the generated image URLs
 * as reference sheets for future episode consistency.
 */

const google = require('../../../nodes/llm-call/providers/google');
const CharacterSheetService = require('./CharacterSheetService');

const EXTRACT_MODEL = 'gemini-2.5-flash-lite';

class CharacterExtractor {
  /**
   * Extract characters from first episode panels and save as character sheets
   * @param {string} seriesId
   * @param {Array<{ image: string, text: string }>} panels - Parsed panel data
   * @param {string[]} imageUrls - Generated image URLs (same order as panels)
   */
  static async extractAndSave(seriesId, panels, imageUrls) {
    // Skip if series already has characters
    const hasExisting = await CharacterSheetService.hasCharacters(seriesId);
    if (hasExisting) return [];

    // Need at least one valid image
    const validImages = imageUrls.filter(Boolean);
    if (validImages.length === 0) return [];

    // Ask LLM to identify characters from panel descriptions
    const characters = await this._identifyCharacters(panels);
    if (characters.length === 0) return [];

    // Assign reference images: use the first panel where each character appears
    const results = [];
    for (const char of characters) {
      // Find best panel image for this character (match by name mention in IMAGE description)
      const refUrl = this._findBestReferenceImage(char.name, panels, imageUrls);
      if (!refUrl) continue;

      results.push({
        name: char.name,
        referenceImageUrl: refUrl,
        description: char.description,
      });
    }

    if (results.length === 0) return [];

    // Save to DB
    const saved = await CharacterSheetService.bulkCreate(seriesId, results);
    console.log(`CharacterExtractor: saved ${saved.length} characters for series ${seriesId}`);
    return saved;
  }

  /**
   * Ask LLM to identify main characters from panel descriptions
   */
  static async _identifyCharacters(panels) {
    const panelDescs = panels
      .map((p, i) => `Panel ${i + 1}: ${p.image}`)
      .join('\n');

    const prompt = `Analyze these webtoon panel descriptions and list the main characters.

${panelDescs}

Return a JSON array of characters. Each character should have:
- "name": character name (as it appears in the descriptions)
- "description": physical appearance summary (hair, eyes, clothes, build)

Return ONLY the JSON array, no other text. Example:
[{"name": "Kai", "description": "shoulder-length dark brown messy hair, ice-blue eyes, lean build, torn leather armor"}]`;

    try {
      const response = await google.call(EXTRACT_MODEL, 'You are a character analyst. Return only valid JSON.', prompt, {
        maxOutputTokens: 1024,
      });

      // Parse JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(c => c.name && typeof c.name === 'string')
        .slice(0, 5); // max 5 characters
    } catch (err) {
      console.warn('CharacterExtractor: LLM extraction failed:', err.message);
      return [];
    }
  }

  /**
   * Find the best reference image for a character by matching name in panel descriptions
   */
  static _findBestReferenceImage(characterName, panels, imageUrls) {
    const nameLower = characterName.toLowerCase();

    // First pass: find panel where character name appears in IMAGE description
    for (let i = 0; i < panels.length; i++) {
      if (imageUrls[i] && panels[i].image.toLowerCase().includes(nameLower)) {
        return imageUrls[i];
      }
    }

    // Fallback: first valid image
    return imageUrls.find(Boolean) || null;
  }
}

module.exports = CharacterExtractor;
