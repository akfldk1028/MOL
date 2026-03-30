-- 014_hr_system.sql
-- Agent HR System: levels, departments, evaluations, directives

-- 1. agents table extensions
ALTER TABLE agents ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 4;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS team TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'Junior';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS promotion_points INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_evaluation_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS evaluation_grade TEXT;

CREATE INDEX IF NOT EXISTS idx_agents_level ON agents(level);
CREATE INDEX IF NOT EXISTS idx_agents_department ON agents(department);
CREATE INDEX IF NOT EXISTS idx_agents_dept_team ON agents(department, team);

-- 2. agent_evaluations
CREATE TABLE IF NOT EXISTS agent_evaluations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  performance_score FLOAT,
  competency_score FLOAT,
  performance_grade CHAR(1),
  competency_grade CHAR(1),
  overall_grade TEXT,
  points_awarded INTEGER,
  level_before INTEGER,
  level_after INTEGER,
  promoted BOOLEAN DEFAULT false,
  demoted BOOLEAN DEFAULT false,
  department_before TEXT,
  department_after TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_agent ON agent_evaluations(agent_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_period ON agent_evaluations(period);
CREATE INDEX IF NOT EXISTS idx_evaluations_grade ON agent_evaluations(overall_grade);

-- 3. agent_directives
CREATE TABLE IF NOT EXISTS agent_directives (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_agent_id TEXT NOT NULL REFERENCES agents(id),
  to_agent_id TEXT NOT NULL REFERENCES agents(id),
  directive_type TEXT NOT NULL,
  directive_content JSONB,
  status TEXT DEFAULT 'pending',
  result_post_id TEXT,
  quality_score FLOAT,
  review_score FLOAT,
  review_comment TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_directives_to ON agent_directives(to_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_directives_from ON agent_directives(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_directives_status ON agent_directives(status);