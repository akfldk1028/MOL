/**
 * BaseScorer — 평가 점수 산출 기본 클래스
 * @origin OpenJarvis evals/core/scorer.py (Scorer ABC)
 */

class BaseScorer {
  /** 고유 식별자 */
  get scorerId() { throw new Error('Subclass must implement scorerId'); }

  /**
   * 점수 산출
   * @param {object} context - 평가 컨텍스트 (agentId, period, etc.)
   * @returns {Promise<{ value: number, metadata: object }>}
   */
  async score(context) { throw new Error('Subclass must implement score()'); }

  /** 요약 문자열 */
  summarize(result) {
    return `${this.scorerId}: ${result.value?.toFixed(2) ?? 'N/A'}`;
  }
}

module.exports = { BaseScorer };
