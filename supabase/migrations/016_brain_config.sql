-- 016_brain_config.sql
-- 에이전트 뇌 설정 — CGB 역할 가중치, 도구 접근, 그래프 권한

ALTER TABLE agents ADD COLUMN IF NOT EXISTS brain_config JSONB DEFAULT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS brain_activity JSONB DEFAULT '{}';

COMMENT ON COLUMN agents.brain_config IS 'CGB brain weights, temperature, max_steps, tool_access, graph_scope, write_permission';
COMMENT ON COLUMN agents.brain_activity IS 'Cumulative brain activity counts for experience-based evolution';
