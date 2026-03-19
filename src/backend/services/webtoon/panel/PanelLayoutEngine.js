/**
 * PanelLayoutEngine — Determine panel sizing/emphasis based on content
 *
 * Assigns emphasis (full/standard/narrow) to each panel based on:
 * - Position (first/last panels get emphasis)
 * - Camera angle (close-ups → full, wide shots → full)
 * - Dialogue presence (dialogue-heavy → narrow for focus)
 * - Emotion intensity (dramatic moments → full)
 *
 * Maps to WebtoonViewer's existing emphasis system.
 */

const DRAMATIC_EMOTIONS = new Set([
  'angry', 'scared', 'desperate', 'shocked', 'surprised',
]);

const WIDE_ANGLES = new Set([
  'wide shot', 'full shot', 'establishing shot',
  'bird\'s eye', 'overhead', 'top-down',
]);

const CLOSE_ANGLES = new Set([
  'close-up', 'closeup', 'extreme close-up',
]);

class PanelLayoutEngine {
  /**
   * Assign emphasis to each panel
   * @param {Array<ParsedPanel>} panels - From PanelScriptParser
   * @returns {Array<ParsedPanel & { emphasis: string, aspectRatio: string }>}
   */
  static assignLayout(panels) {
    return panels.map((panel, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === panels.length - 1;
      const isDramatic = DRAMATIC_EMOTIONS.has(panel.emotion);
      const isWideShot = WIDE_ANGLES.has(panel.cameraAngle);
      const isCloseUp = CLOSE_ANGLES.has(panel.cameraAngle);
      const hasLongDialogue = panel.dialogue && panel.dialogue.length > 50;

      let emphasis = 'standard';
      let aspectRatio = '9:16'; // default vertical webtoon

      // First panel: establishing shot → full width
      if (isFirst) {
        emphasis = 'full';
      }
      // Last panel: climax/cliffhanger → full width
      else if (isLast) {
        emphasis = 'full';
      }
      // Dramatic emotion → full width
      else if (isDramatic) {
        emphasis = 'full';
      }
      // Wide/establishing shots → full width
      else if (isWideShot) {
        emphasis = 'full';
        aspectRatio = '16:9'; // landscape for wide shots
      }
      // Close-ups with short/no dialogue → standard
      else if (isCloseUp && !hasLongDialogue) {
        emphasis = 'standard';
      }
      // Dialogue-heavy panels → narrow (conversation focus)
      else if (hasLongDialogue && !isCloseUp) {
        emphasis = 'narrow';
      }

      return { ...panel, emphasis, aspectRatio };
    });
  }

  /**
   * Get recommended panel count based on episode type
   * @param {'action' | 'dialogue' | 'exposition' | 'standard'} sceneType
   * @returns {{ min: number, max: number }}
   */
  static getRecommendedPanelCount(sceneType) {
    switch (sceneType) {
      case 'action': return { min: 6, max: 8 };
      case 'dialogue': return { min: 4, max: 6 };
      case 'exposition': return { min: 3, max: 5 };
      default: return { min: 4, max: 8 };
    }
  }
}

module.exports = PanelLayoutEngine;
