/**
 * ScoreTracker — 에이전트 비평 점수 추이 추적 + keep/discard 판정
 *
 * @origin clone/autoagent program.md L149-169
 *   "If passed improved, keep. If passed stayed the same and harness is simpler, keep.
 *    Otherwise, discard."
 *
 * MOL 적용: episode critique 5축 점수(prompt_accuracy, creativity, quality,
 *   consistency, emotional_resonance)의 추이를 추적하여 brain_config 변경을
 *   keep할지 discard할지 판정.
 */

// 점수 축 → brain_config role weight 매핑
const SCORE_TO_ROLE = {
  creativity: 'divergent',
  quality: 'iterator',
  consistency: 'evaluator',
  emotional_resonance: 'director',
  prompt_accuracy: 'researcher',
};

// 점수 축 → temperature 방향 (낮은 점수 = 더 탐색적)
const SCORE_TO_TEMP = {
  creativity: +0.05,        // 창의성 낮으면 temperature 올려서 탐색
  consistency: -0.05,       // 일관성 낮으면 temperature 내려서 안정
};

const MIN_EPISODES_FOR_DELTA = 4; // 최소 2 vs 2 비교 (1 vs 1은 노이즈)
const WEIGHT_STEP = 0.02;
const TEMP_STEP = 0.05;

/**
 * 두 점수 세트의 축별 delta 계산.
 * @param {object} recent  - { creativity: 7.5, quality: 8, ... }
 * @param {object} previous - { creativity: 6.0, quality: 8, ... }
 * @returns {object} { creativity: +1.5, quality: 0, ... }
 */
function calculateScoreDelta(recent, previous) {
  const delta = {};
  for (const axis of Object.keys(SCORE_TO_ROLE)) {
    const r = recent[axis];
    const p = previous[axis];
    if (typeof r === 'number' && typeof p === 'number') {
      delta[axis] = Math.round((r - p) * 100) / 100;
    }
  }
  return delta;
}

/**
 * 여러 에피소드의 점수를 축별 평균으로 집계.
 * @param {Array<object>} scores - [{ creativity: 7, quality: 8, ... }, ...]
 * @returns {object} { creativity: 7.5, quality: 8, ... }
 */
function averageScores(scores) {
  if (!scores || scores.length === 0) return {};
  const axes = Object.keys(SCORE_TO_ROLE);
  const avg = {};
  for (const axis of axes) {
    const values = scores.map(s => s[axis]).filter(v => typeof v === 'number');
    avg[axis] = values.length > 0
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
      : null;
  }
  return avg;
}

/**
 * Keep/Discard 판정 — AutoAgent 핵심 루프.
 *
 * @origin program.md: "If passed improved, keep. Otherwise discard."
 *
 * @param {object} scoreBefore - 이전 평균 점수
 * @param {object} scoreAfter  - 현재 평균 점수
 * @returns {{ decision: 'keep'|'discard'|'neutral', reasoning: string, delta: object }}
 */
function shouldKeepChange(scoreBefore, scoreAfter) {
  const delta = calculateScoreDelta(scoreAfter, scoreBefore);
  const axes = Object.keys(delta);

  if (axes.length === 0) {
    return { decision: 'neutral', reasoning: 'No comparable scores', delta };
  }

  // overall이 있으면 그것으로 1차 판정
  if (typeof scoreAfter.overall === 'number' && typeof scoreBefore.overall === 'number') {
    const overallDelta = scoreAfter.overall - scoreBefore.overall;
    if (overallDelta > 0.3) {
      return { decision: 'keep', reasoning: `overall +${overallDelta.toFixed(1)}`, delta };
    }
    if (overallDelta < -0.3) {
      return { decision: 'discard', reasoning: `overall ${overallDelta.toFixed(1)}`, delta };
    }
  }

  // 축별 판정: 개선된 축 수 vs 악화된 축 수
  let improved = 0;
  let degraded = 0;
  for (const [, d] of Object.entries(delta)) {
    if (d > 0.5) improved++;
    if (d < -0.5) degraded++;
  }

  if (improved > degraded) {
    return { decision: 'keep', reasoning: `${improved} axes improved, ${degraded} degraded`, delta };
  }
  if (degraded > improved) {
    return { decision: 'discard', reasoning: `${degraded} axes degraded, ${improved} improved`, delta };
  }
  return { decision: 'neutral', reasoning: 'No significant change', delta };
}

/**
 * Delta 기반으로 brain_config 변경안 생성.
 *
 * @param {object} delta - { creativity: +1.5, quality: -0.5, ... }
 * @returns {{ weightChanges: object, tempChange: number }}
 */
function suggestConfigChanges(delta) {
  const weightChanges = {};
  let tempChange = 0;

  for (const [axis, d] of Object.entries(delta)) {
    if (typeof d !== 'number' || Math.abs(d) < 0.5) continue;

    const role = SCORE_TO_ROLE[axis];
    if (role) {
      // 점수 올랐으면 해당 role 강화, 떨어졌으면 약화
      weightChanges[role] = (weightChanges[role] || 0) + (d > 0 ? WEIGHT_STEP : -WEIGHT_STEP);
    }

    // Temperature 조정
    if (SCORE_TO_TEMP[axis]) {
      if (d < -0.5) {
        tempChange += SCORE_TO_TEMP[axis];
      }
    }
  }

  // Temperature bounds
  tempChange = Math.max(-0.15, Math.min(0.15, tempChange));
  tempChange = Math.round(tempChange * 100) / 100;

  return { weightChanges, tempChange };
}

/**
 * Overfitting 검사 — AutoAgent 원칙.
 * @origin program.md L189-195: "이 태스크가 사라져도 이 변경이 가치 있는가?"
 *
 * MOL 적용: 한 시리즈에서만 점수 오르고 다른 시리즈에서 효과 없으면 overfitting.
 *
 * @param {Array<object>} seriesScores - [{ seriesId, delta }]
 * @returns {boolean} true if likely overfitting
 */
function isLikelyOverfitting(seriesScores) {
  if (!seriesScores || seriesScores.length < 2) return false;
  const improved = seriesScores.filter(s => s.delta?.overall > 0.5).length;
  // 1개 시리즈만 개선되고 나머지는 변화 없거나 악화 → overfitting
  return improved === 1 && seriesScores.length >= 3;
}

module.exports = {
  SCORE_TO_ROLE,
  MIN_EPISODES_FOR_DELTA,
  calculateScoreDelta,
  averageScores,
  shouldKeepChange,
  suggestConfigChanges,
  isLikelyOverfitting,
};
