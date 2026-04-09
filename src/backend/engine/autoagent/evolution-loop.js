/**
 * EvolutionLoop — Score-driven 에이전트 자기개선 루프
 *
 * @origin clone/autoagent program.md (Experiment Loop 전체)
 *   "1. Check current state → 2. Read results → 3. Diagnose failures
 *    → 4. Group by root cause → 5. Choose improvement → 6. Edit
 *    → 7. Commit → 8. Rerun → 9. Record → 10. Keep or discard"
 *
 * MOL 적용:
 *   비평 점수 수집 → delta 계산 → keep/discard 판정
 *   → keep이면 brain_config 업데이트 + CGB Evolution 노드 기록
 *   → 실패 통계로 약점 진단 → 다음 진화 방향 제안
 *
 * 호출 시점: TaskWorker._handleCritiqueEpisode() 에서 feedback distill 후
 */

const { queryOne, queryAll } = require('../../config/database');
const BrainClient = require('../../services/BrainClient');
const { applyScoreFeedback, applyGraphFeedback } = require('../../services/BrainEvolution');
const {
  averageScores,
  shouldKeepChange,
  suggestConfigChanges,
  isLikelyOverfitting,
  MIN_EPISODES_FOR_DELTA,
} = require('./score-tracker');
const { getFailureStats, diagnoseWeaknesses } = require('./failure-classifier');

/**
 * 에이전트의 시리즈별 최근 에피소드 점수 수집.
 *
 * @param {string} agentId
 * @param {string} seriesId
 * @param {number} [limit=6] - 최근 N개
 * @returns {Promise<Array<object>>} [{ episode_number, scores: { creativity, quality, ... } }]
 */
async function getRecentEpisodeScores(agentId, seriesId, limit = 6) {
  const rows = await queryAll(
    `SELECT e.episode_number, e.feedback_score
     FROM episodes e
     JOIN series s ON e.series_id = s.id
     WHERE s.id = $1
       AND s.author_id = $2
       AND e.feedback_score IS NOT NULL
     ORDER BY e.episode_number DESC
     LIMIT $3`,
    [seriesId, agentId, limit]
  );

  return rows
    .map(r => {
      let scores = r.feedback_score;
      if (typeof scores === 'string') {
        try { scores = JSON.parse(scores); } catch { scores = null; }
      }
      return scores ? { episodeNumber: r.episode_number, scores } : null;
    })
    .filter(Boolean)
    .reverse(); // 오래된 것부터
}

/**
 * 메인 진화 스텝 — 에피소드 비평 후 호출.
 *
 * @param {string} agentId
 * @param {string} seriesId
 * @param {object} latestScores - 방금 distill된 점수 { creativity, quality, ... }
 * @returns {Promise<{ decision, configDelta, reasoning } | null>}
 */
async function runEvolutionStep(agentId, seriesId, latestScores) {
  // 1. 최근 에피소드 점수 수집
  const allScores = await getRecentEpisodeScores(agentId, seriesId);
  if (allScores.length < MIN_EPISODES_FOR_DELTA) {
    return null; // 비교할 데이터 부족
  }

  // 2. 이전 vs 최근 점수 분할
  const mid = Math.floor(allScores.length / 2);
  const previousHalf = allScores.slice(0, mid).map(s => s.scores);
  const recentHalf = allScores.slice(mid).map(s => s.scores);

  const previousAvg = averageScores(previousHalf);
  const recentAvg = averageScores(recentHalf);

  // 3. Keep/Discard 판정
  const verdict = shouldKeepChange(previousAvg, recentAvg);

  // 4. brain_config 업데이트 (keep일 때만)
  let configDelta = null;
  if (verdict.decision === 'keep') {
    const changes = suggestConfigChanges(verdict.delta);
    configDelta = changes;

    // DB에서 현재 brain_config 가져와서 적용
    try {
      const agent = await queryOne('SELECT brain_config FROM agents WHERE id = $1', [agentId]);
      if (agent?.brain_config) {
        const currentConfig = typeof agent.brain_config === 'string'
          ? JSON.parse(agent.brain_config)
          : agent.brain_config;

        let evolved = applyScoreFeedback(currentConfig, changes);

        // Phase 2: Graph-driven feedback — apply inline before single DB write
        if (evolved) {
          try {
            const metrics = await BrainClient.getAgentGraphMetrics(agentId);
            if (metrics) {
              const { config: graphEvolved, changes: graphChanges } = applyGraphFeedback(evolved, metrics);
              if (graphChanges.length > 0) {
                evolved = graphEvolved;
                console.log(`EvolutionLoop: ${agentId} graph feedback: ${graphChanges.join(', ')}`);
              }
            }
          } catch (graphErr) {
            console.warn(`EvolutionLoop: graph feedback failed for ${agentId}:`, graphErr.message);
          }

          await queryOne(
            'UPDATE agents SET brain_config = $1 WHERE id = $2',
            [JSON.stringify(evolved), agentId]
          );
        }
      }
    } catch (err) {
      console.warn(`EvolutionLoop: brain_config update failed for ${agentId}:`, err.message);
    }
  }

  // 5. CGB에 Evolution 노드 기록 (keep/discard 모두)
  try {
    await BrainClient.recordEvolution(agentId, {
      type: 'score_feedback',
      target: `series-${seriesId}`,
      reason: verdict.reasoning,
      metadata: {
        score_before: previousAvg,
        score_after: recentAvg,
        decision: verdict.decision,
        config_delta: configDelta,
        episodes_compared: allScores.length,
      },
    });
  } catch (err) {
    console.warn(`EvolutionLoop: CGB evolution record failed for ${agentId}:`, err.message);
  }

  // 6. 실패 통계 진단 (비동기, 로그만)
  getFailureStats(agentId).then(stats => {
    const weaknesses = diagnoseWeaknesses(stats);
    if (weaknesses.length > 0) {
      console.log(`EvolutionLoop: ${agentId} weaknesses:`, weaknesses.map(w => w.weakness).join(', '));
    }
  }).catch(() => {});

  console.log(`EvolutionLoop: ${agentId} series=${seriesId} decision=${verdict.decision} (${verdict.reasoning})`);

  return {
    decision: verdict.decision,
    configDelta,
    reasoning: verdict.reasoning,
    scoreBefore: previousAvg,
    scoreAfter: recentAvg,
  };
}

module.exports = {
  runEvolutionStep,
  getRecentEpisodeScores,
};
