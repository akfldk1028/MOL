/**
 * PanelScriptParser — Parse [PANEL]...[/PANEL] blocks from LLM output
 *
 * Enhanced parser that extracts structured data from each panel:
 * - sceneDescription: full IMAGE prompt
 * - characters: character names mentioned
 * - emotion: detected emotion/mood
 * - dialogue: TEXT content
 * - cameraAngle: detected camera angle hint
 */

const CAMERA_ANGLES = [
  'close-up', 'closeup', 'extreme close-up',
  'medium shot', 'mid shot',
  'wide shot', 'full shot', 'establishing shot',
  'bird\'s eye', 'overhead', 'top-down',
  'low angle', 'high angle',
  'dutch angle', 'tilted',
  'over the shoulder', 'pov',
];

const EMOTIONS = [
  'angry', 'sad', 'happy', 'surprised', 'scared', 'confused',
  'determined', 'calm', 'nervous', 'excited', 'worried', 'desperate',
  'smiling', 'crying', 'laughing', 'grimacing', 'shocked', 'grinning',
];

class PanelScriptParser {
  /**
   * Parse [PANEL]...[/PANEL] blocks from content
   * @param {string} content - Raw LLM output
   * @returns {Array<ParsedPanel>}
   */
  static parse(content) {
    const panels = [];
    const MAX_PANELS = 20;

    // Try closed [PANEL]...[/PANEL] first
    const closedRegex = /\[PANEL\]\s*\n([\s\S]*?)\[\/PANEL\]/gi;
    let match;
    while ((match = closedRegex.exec(content)) !== null) {
      if (panels.length >= MAX_PANELS) break;
      const parsed = this._parseBlock(match[1]);
      if (parsed) panels.push(parsed);
    }

    // Fallback: [PANEL] without [/PANEL] — split on next [PANEL] or end of string
    if (panels.length === 0) {
      const openRegex = /\[PANEL\]\s*\n/gi;
      const starts = [];
      while ((match = openRegex.exec(content)) !== null) {
        starts.push(match.index + match[0].length);
      }
      for (let i = 0; i < starts.length && panels.length < MAX_PANELS; i++) {
        const end = i + 1 < starts.length
          ? content.lastIndexOf('[PANEL]', starts[i + 1])
          : content.length;
        const block = content.slice(starts[i], end);
        const parsed = this._parseBlock(block);
        if (parsed) panels.push(parsed);
      }
    }

    return panels;
  }

  /**
   * Parse a single panel block into structured data
   */
  static _parseBlock(raw) {
    const block = raw.trim().slice(0, 3000);
    const imageMatch = block.match(/^IMAGE:\s*(.+)/im);
    const textMatch = block.match(/^TEXT:\s*([\s\S]*?)$/im);

    const sceneDescription = imageMatch ? imageMatch[1].trim() : '';
    const dialogue = textMatch ? textMatch[1].trim() : '';

    if (!sceneDescription && !dialogue) return null;

    return {
      sceneDescription,
      dialogue,
      characters: this._extractCharacterNames(sceneDescription),
      emotion: this._detectEmotion(sceneDescription),
      cameraAngle: this._detectCameraAngle(sceneDescription),
    };
  }

  /**
   * Extract character name patterns from scene description
   * Looks for patterns like "A young man named Kai" or "[character_name]"
   */
  static _extractCharacterNames(description) {
    const names = new Set();

    // Pattern: "named X" or "called X"
    const namedPattern = /(?:named|called)\s+([A-Z][a-zA-Z]+)/g;
    let m;
    while ((m = namedPattern.exec(description)) !== null) {
      names.add(m[1]);
    }

    // Pattern: proper nouns at start of descriptions (capitalized words that aren't common words)
    const commonWords = new Set([
      'a', 'an', 'the', 'in', 'on', 'at', 'with', 'from', 'close', 'wide', 'medium', 'full', 'high', 'low',
      'dark', 'light', 'bright', 'deep', 'soft', 'hard', 'long', 'short', 'big', 'small',
      'fantasy', 'horror', 'manga', 'webtoon', 'comic', 'panel', 'shot', 'scene', 'style',
      'image', 'text', 'color', 'black', 'white', 'red', 'blue', 'green', 'brown',
    ]);
    const words = description.split(/[\s,]+/);
    for (const word of words) {
      if (/^[A-Z][a-z]+$/.test(word) && !commonWords.has(word.toLowerCase()) && word.length > 2) {
        // Could be a name - add if it appears as a standalone capitalized word
        if (description.includes(word) && !CAMERA_ANGLES.some(a => a.includes(word.toLowerCase()))) {
          names.add(word);
        }
      }
    }

    return [...names].slice(0, 4);
  }

  /**
   * Detect emotion from scene description
   */
  static _detectEmotion(description) {
    const descLower = description.toLowerCase();
    for (const emotion of EMOTIONS) {
      if (descLower.includes(emotion)) return emotion;
    }
    return 'neutral';
  }

  /**
   * Detect camera angle from scene description
   */
  static _detectCameraAngle(description) {
    const descLower = description.toLowerCase();
    for (const angle of CAMERA_ANGLES) {
      if (descLower.includes(angle)) return angle;
    }
    return 'standard';
  }
}

module.exports = PanelScriptParser;
