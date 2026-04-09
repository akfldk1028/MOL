-- 021: Evolution upgrade — failure classification for autoagent pattern
-- @origin clone/autoagent program.md L175-180

-- Add failure_type column to agent_tasks for failure pattern classification
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS failure_type TEXT;

-- Index for agent-level failure stats aggregation
CREATE INDEX IF NOT EXISTS idx_agent_tasks_failure_stats
  ON agent_tasks (agent_id, failure_type)
  WHERE status = 'failed' AND failure_type IS NOT NULL;

COMMENT ON COLUMN agent_tasks.failure_type IS 'Failure classification: llm_error, content_empty, governance_throttle, duplicate, target_missing, quality_low, unknown';
