-- 022: Eval results — 성능 평가 결과 저장
-- evals/run.js → db-reporter로 기록, 시계열 추이 분석용

CREATE TABLE IF NOT EXISTS eval_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  eval_type TEXT NOT NULL,          -- 'agent', 'cgb', 'engine', 'content'
  eval_name TEXT NOT NULL,          -- 'creativity-score', 'search-quality', ...
  target_id TEXT,                   -- agent_id, series_id, etc. (nullable for global evals)
  score NUMERIC,
  metadata JSONB DEFAULT '{}',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_results_type
  ON eval_results (eval_type, eval_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eval_results_target
  ON eval_results (target_id, eval_type, created_at DESC)
  WHERE target_id IS NOT NULL;

COMMENT ON TABLE eval_results IS 'MOL performance evaluation results — agent, CGB, engine, content metrics';
