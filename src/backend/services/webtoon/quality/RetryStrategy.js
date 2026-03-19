/**
 * RetryStrategy — Handle failed/low-quality panel regeneration
 *
 * When QualityEvaluator scores below threshold, this module decides
 * how to modify the prompt and retry image generation.
 */

class RetryStrategy {
  /**
   * Determine if and how to retry a failed panel
   * @param {object} evalResult - From QualityEvaluator
   * @param {string} originalPrompt - Original image prompt
   * @param {number} attemptNumber - Current attempt (0-based)
   * @param {number} maxRetries - Maximum retries allowed (default 2)
   * @returns {{ shouldRetry: boolean, modifiedPrompt?: string, reason?: string }}
   */
  static decide(evalResult, originalPrompt, attemptNumber, maxRetries = 2) {
    if (attemptNumber >= maxRetries) {
      return { shouldRetry: false, reason: 'max retries reached' };
    }

    if (!evalResult || evalResult.pass) {
      return { shouldRetry: false };
    }

    const { scores, issues } = evalResult;
    const modifications = [];

    // Character consistency is low → add stronger character description
    if (scores.character_consistency < 3) {
      modifications.push('Ensure EXACT character appearance as described.');
      modifications.push('Focus on: correct hair color, eye color, clothing details.');
    }

    // Aesthetic quality is low → add quality boosters
    if (scores.aesthetic_quality < 3) {
      modifications.push('High quality, detailed illustration, professional artwork.');
      modifications.push('Clean lineart, vibrant colors, proper anatomy.');
    }

    // Text alignment is low → emphasize the key elements
    if (scores.text_alignment < 3) {
      modifications.push('IMPORTANT: Follow the scene description exactly.');
    }

    if (modifications.length === 0) {
      return { shouldRetry: false };
    }

    // Build modified prompt: original + corrections
    const modifiedPrompt = `${originalPrompt}\n\n[CORRECTIONS: ${modifications.join(' ')} ${issues ? `Fix: ${issues}` : ''}]`;

    return {
      shouldRetry: true,
      modifiedPrompt: modifiedPrompt.slice(0, 2000),
      reason: `Low scores: char=${scores.character_consistency}, quality=${scores.aesthetic_quality}, align=${scores.text_alignment}`,
    };
  }
}

module.exports = RetryStrategy;
