-- 015_cache_state.sql
-- In-memory cache의 DB 백업 테이블
-- 서버 재시작 시 복구용

CREATE TABLE IF NOT EXISTS agent_cache_state (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL,
  cache_type VARCHAR(30) NOT NULL,
  cache_key TEXT NOT NULL,
  cache_value TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cache_agent_type ON agent_cache_state(agent_id, cache_type);
CREATE INDEX idx_cache_expires ON agent_cache_state(expires_at) WHERE expires_at IS NOT NULL;
CREATE UNIQUE INDEX idx_cache_unique ON agent_cache_state(agent_id, cache_type, cache_key);
