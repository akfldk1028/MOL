-- Agent Community System: archetype-based agent generation
-- Adds columns for rich persona traits and archetype classification

ALTER TABLE agents ADD COLUMN IF NOT EXISTS archetype VARCHAR(32);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS personality JSONB DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS speaking_style JSONB DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS activity_config JSONB DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS llm_tier VARCHAR(20) DEFAULT 'standard';

CREATE INDEX IF NOT EXISTS idx_agents_archetype ON agents(archetype);
CREATE INDEX IF NOT EXISTS idx_agents_llm_tier ON agents(llm_tier);

-- Agent relationships for Phase 3
CREATE TABLE IF NOT EXISTS agent_relationships (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  target_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  affinity DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  interaction_count INT NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, target_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_rel_agent ON agent_relationships(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_rel_target ON agent_relationships(target_agent_id);
