/**
 * StatisticalScorer — 통계 기반 점수 (평균, 분위수, 추이)
 * @origin OpenJarvis bench/_stats.py (compute_stats)
 */

const { BaseScorer } = require('./base-scorer');

/**
 * 숫자 배열의 통계 계산.
 * @param {number[]} values
 * @returns {{ mean, median, p5, p25, p75, p95, min, max, std, count }}
 */
function computeStats(values) {
  if (!values || values.length === 0) {
    return { mean: 0, median: 0, p5: 0, p25: 0, p75: 0, p95: 0, min: 0, max: 0, std: 0, count: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;

  const percentile = (p) => {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };

  return {
    mean: round(mean),
    median: round(percentile(50)),
    p5: round(percentile(5)),
    p25: round(percentile(25)),
    p75: round(percentile(75)),
    p95: round(percentile(95)),
    min: sorted[0],
    max: sorted[n - 1],
    std: round(Math.sqrt(variance)),
    count: n,
  };
}

/**
 * 추이 계산: 전반 vs 후반 평균 delta.
 * @param {number[]} values - 시간순
 * @returns {{ trend: 'improving'|'declining'|'stable', delta: number }}
 */
function computeTrend(values) {
  if (values.length < 4) return { trend: 'stable', delta: 0 };
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const delta = round(avgSecond - avgFirst);

  let trend = 'stable';
  if (delta > 0.3) trend = 'improving';
  else if (delta < -0.3) trend = 'declining';

  return { trend, delta };
}

function round(v) { return Math.round(v * 100) / 100; }

class StatisticalScorer extends BaseScorer {
  constructor(scorerName) {
    super();
    this._name = scorerName;
  }

  get scorerId() { return this._name; }

  /**
   * @param {{ values: number[] }} context
   */
  async score(context) {
    const stats = computeStats(context.values || []);
    const trend = computeTrend(context.values || []);
    return { value: stats.mean, metadata: { ...stats, ...trend } };
  }
}

module.exports = { StatisticalScorer, computeStats, computeTrend };
