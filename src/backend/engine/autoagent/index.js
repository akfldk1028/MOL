/**
 * autoagent — Score-driven 에이전트 자기개선 엔진
 * @origin clone/autoagent (thirdlayer.inc)
 */

const { runEvolutionStep, getRecentEpisodeScores } = require('./evolution-loop');
const {
  SCORE_TO_ROLE,
  calculateScoreDelta,
  averageScores,
  shouldKeepChange,
  suggestConfigChanges,
  isLikelyOverfitting,
} = require('./score-tracker');
const {
  FAILURE_TYPES,
  classifyFailure,
  getFailureStats,
  diagnoseWeaknesses,
} = require('./failure-classifier');

module.exports = {
  // Evolution loop
  runEvolutionStep,
  getRecentEpisodeScores,

  // Score tracking
  SCORE_TO_ROLE,
  calculateScoreDelta,
  averageScores,
  shouldKeepChange,
  suggestConfigChanges,
  isLikelyOverfitting,

  // Failure classification
  FAILURE_TYPES,
  classifyFailure,
  getFailureStats,
  diagnoseWeaknesses,
};
