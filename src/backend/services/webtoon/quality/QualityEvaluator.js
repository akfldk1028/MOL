/**
 * QualityEvaluator — LLM-based image quality evaluation
 *
 * Uses Gemini vision to evaluate generated panel images on:
 * - Character consistency (1-5): do characters match their descriptions?
 * - Aesthetic quality (1-5): overall visual quality
 * - Text alignment (1-5): does the image match the prompt?
 *
 * Inspired by Diffusion-Sharpening's MLLMGrader reward model.
 */

const google = require('../../../nodes/llm-call/providers/google');

const EVAL_MODEL = 'gemini-2.5-flash-lite';

const EVALUATION_PROMPT = `You are an image quality evaluator for webtoon panels.

Evaluate this generated image against the original prompt.

Rate on three criteria (1-5 scale each):
1. CHARACTER_CONSISTENCY: Do characters match the described appearance? (hair, eyes, clothes, build)
2. AESTHETIC_QUALITY: Overall visual quality, composition, coloring
3. TEXT_ALIGNMENT: Does the image accurately depict what was described?

Return ONLY a JSON object like:
{"character_consistency": 4, "aesthetic_quality": 3, "text_alignment": 4, "issues": "character hair color slightly off"}`;

class QualityEvaluator {
  /**
   * Evaluate a generated panel image
   * @param {string} imageUrl - URL of generated image
   * @param {string} originalPrompt - The prompt used to generate
   * @returns {Promise<{ scores: object, average: number, issues: string, pass: boolean }>}
   */
  static async evaluate(imageUrl, originalPrompt) {
    try {
      const userPrompt = `Original prompt: "${originalPrompt.slice(0, 500)}"\n\nEvaluate the generated image above.`;

      const response = await google.call(EVAL_MODEL, EVALUATION_PROMPT, userPrompt, {
        imageUrls: [imageUrl],
        maxOutputTokens: 256,
      });

      return this._parseEvaluation(response);
    } catch (err) {
      console.warn('QualityEvaluator: evaluation failed:', err.message);
      // Default to passing on error (don't block pipeline)
      return {
        scores: { character_consistency: 3, aesthetic_quality: 3, text_alignment: 3 },
        average: 3,
        issues: 'evaluation failed',
        pass: true,
      };
    }
  }

  /**
   * Evaluate multiple panels in batch
   * @param {Array<{ imageUrl: string, prompt: string }>} panels
   * @returns {Promise<Array<EvalResult>>}
   */
  static async evaluateBatch(panels) {
    const results = [];
    for (const panel of panels) {
      if (!panel.imageUrl) {
        results.push(null);
        continue;
      }
      const result = await this.evaluate(panel.imageUrl, panel.prompt);
      results.push(result);
    }
    return results;
  }

  /**
   * Parse LLM evaluation response
   */
  static _parseEvaluation(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');

      const parsed = JSON.parse(jsonMatch[0]);
      const scores = {
        character_consistency: this._clampScore(parsed.character_consistency),
        aesthetic_quality: this._clampScore(parsed.aesthetic_quality),
        text_alignment: this._clampScore(parsed.text_alignment),
      };

      const average = (scores.character_consistency + scores.aesthetic_quality + scores.text_alignment) / 3;

      return {
        scores,
        average: Math.round(average * 10) / 10,
        issues: parsed.issues || '',
        pass: average >= 3,
      };
    } catch {
      return {
        scores: { character_consistency: 3, aesthetic_quality: 3, text_alignment: 3 },
        average: 3,
        issues: 'parse error',
        pass: true,
      };
    }
  }

  static _clampScore(val) {
    const n = Number(val);
    if (isNaN(n)) return 3;
    return Math.max(1, Math.min(5, Math.round(n)));
  }
}

module.exports = QualityEvaluator;
