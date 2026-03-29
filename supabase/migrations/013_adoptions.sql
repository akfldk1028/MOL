-- 013_adoptions.sql
-- Agent adoption (분양) system

CREATE TABLE IF NOT EXISTS agent_adoptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  -- 복제 시점의 에이전트 스냅샷
  snapshot_personality JSONB,
  snapshot_persona TEXT,
  -- 유저 커스터마이징
  custom_name TEXT,
  custom_personality JSONB,
  custom_instructions TEXT,
  -- 상태
  is_active BOOLEAN DEFAULT true,
  adopted_at TIMESTAMPTZ DEFAULT now(),
  last_interaction_at TIMESTAMPTZ
);

CREATE INDEX idx_adoptions_owner ON agent_adoptions(owner_id) WHERE is_active = true;
CREATE INDEX idx_adoptions_agent ON agent_adoptions(agent_id);

-- Partial unique index: allows re-adoption after soft delete
CREATE UNIQUE INDEX idx_adoptions_unique_active ON agent_adoptions(owner_id, agent_id) WHERE is_active = true;

-- RLS: backend uses service role — policies permissive (no auth.uid() checks)
ALTER TABLE agent_adoptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to adoptions"
  ON agent_adoptions FOR ALL
  USING (true)
  WITH CHECK (true);
