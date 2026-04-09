/**
 * FailureClassifier — TaskWorker 실패 유형 분류
 *
 * @origin clone/autoagent program.md L175-180
 *   "When diagnosing failures, look for patterns such as:
 *    misunderstanding the task, missing capability or tool,
 *    weak information gathering, bad execution strategy,
 *    missing verification, environment/dependency issues,
 *    silent failure where the agent thinks it succeeded but output is wrong"
 *
 * MOL 적용: TaskWorker._executeTask() 실패 시 에러를 7가지로 분류하여
 *   에이전트별 약점 패턴을 파악, brain_config 진화에 반영.
 */

const { queryAll } = require('../../config/database');

/**
 * 실패 유형 7가지.
 * AutoAgent의 7 failure patterns을 MOL 컨텍스트에 맞게 재해석.
 */
const FAILURE_TYPES = {
  LLM_ERROR: 'llm_error',               // LLM 호출 자체 실패 (timeout, rate limit, API error)
  CONTENT_EMPTY: 'content_empty',         // LLM 응답이 빈 문자열 or 무의미
  GOVERNANCE_THROTTLE: 'governance_throttle', // GovernanceEngine 제한 (hourly limit)
  DUPLICATE: 'duplicate',                 // 중복 콘텐츠 (이미 댓글/포스트 존재)
  TARGET_MISSING: 'target_missing',       // 대상 포스트/에피소드/시리즈 없음
  QUALITY_LOW: 'quality_low',             // 생성은 했지만 비평 점수 매우 낮음
  UNKNOWN: 'unknown',                     // 분류 불가
};

// 에러 메시지 → 실패 유형 매핑 패턴
const ERROR_PATTERNS = [
  { type: FAILURE_TYPES.LLM_ERROR, patterns: [/LLM error/i, /timeout/i, /rate.?limit/i, /API.*error/i, /ECONNREFUSED/i, /fetch failed/i] },
  { type: FAILURE_TYPES.CONTENT_EMPTY, patterns: [/empty.*response/i, /no.*content/i, /response.*blank/i, /trim.*empty/i] },
  { type: FAILURE_TYPES.GOVERNANCE_THROTTLE, patterns: [/throttle/i, /governance/i, /hourly.*limit/i, /daily.*limit/i] },
  { type: FAILURE_TYPES.DUPLICATE, patterns: [/duplicate/i, /already.*exist/i, /already.*comment/i, /already.*post/i] },
  { type: FAILURE_TYPES.TARGET_MISSING, patterns: [/not.*found/i, /no.*post/i, /no.*episode/i, /no.*series/i, /target.*null/i] },
];

/**
 * 에러 메시지 + 태스크 컨텍스트로 실패 유형 분류.
 *
 * @param {Error|string} error
 * @param {{ type?: string, status?: string }} taskContext
 * @returns {string} FAILURE_TYPES 중 하나
 */
function classifyFailure(error, taskContext = {}) {
  const message = typeof error === 'string' ? error : (error?.message || '');

  // 패턴 매칭
  for (const { type, patterns } of ERROR_PATTERNS) {
    if (patterns.some(p => p.test(message))) {
      return type;
    }
  }

  // 컨텍스트 기반 추론
  if (taskContext.status === 'throttled') return FAILURE_TYPES.GOVERNANCE_THROTTLE;

  return FAILURE_TYPES.UNKNOWN;
}

/**
 * 에이전트별 최근 실패 통계 집계.
 *
 * @param {string} agentId
 * @param {number} [days=7] - 최근 N일
 * @returns {Promise<object>} { llm_error: 3, content_empty: 1, ... }
 */
async function getFailureStats(agentId, days = 7) {
  const rows = await queryAll(
    `SELECT failure_type, COUNT(*) as cnt
     FROM agent_tasks
     WHERE agent_id = $1
       AND status = 'failed'
       AND created_at > NOW() - ($2 * INTERVAL '1 day')
       AND failure_type IS NOT NULL
     GROUP BY failure_type`,
    [agentId, days]
  );

  const stats = {};
  for (const type of Object.values(FAILURE_TYPES)) {
    stats[type] = 0;
  }
  for (const row of rows) {
    stats[row.failure_type] = parseInt(row.cnt || '0');
  }

  return stats;
}

/**
 * 실패 통계 → 약점 진단.
 * AutoAgent 원칙: "Prefer changes that fix a class of failures, not a single task."
 *
 * @param {object} stats - getFailureStats() 결과
 * @returns {Array<{ weakness: string, suggestion: string, severity: 'high'|'medium'|'low' }>}
 */
function diagnoseWeaknesses(stats) {
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const diagnoses = [];

  if (stats.llm_error > total * 0.3) {
    diagnoses.push({
      weakness: 'LLM 호출 불안정',
      suggestion: 'temperature 낮추기 or max_tokens 줄이기',
      severity: 'high',
    });
  }

  if (stats.content_empty > total * 0.2) {
    diagnoses.push({
      weakness: '빈 응답 빈발',
      suggestion: 'system prompt 강화 or model 업그레이드',
      severity: 'high',
    });
  }

  if (stats.quality_low > total * 0.2) {
    diagnoses.push({
      weakness: '품질 낮음',
      suggestion: 'iterator/evaluator weight 강화',
      severity: 'medium',
    });
  }

  if (stats.duplicate > total * 0.3) {
    diagnoses.push({
      weakness: '중복 생성 과다',
      suggestion: 'browsed_posts 메모리 확인 or 쿨다운 조정',
      severity: 'low',
    });
  }

  return diagnoses;
}

module.exports = {
  FAILURE_TYPES,
  classifyFailure,
  getFailureStats,
  diagnoseWeaknesses,
};
