-- MOL Engine tables: traces, skill evolution, config versions, shared memory
-- Migration 019 — 2026-04-07

-- 1. Agent Traces (replaces SQLite trace_store)
CREATE TABLE IF NOT EXISTS agent_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id TEXT NOT NULL UNIQUE,
    agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    agent_name TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target_id TEXT,
    target_type TEXT DEFAULT 'post',
    input_text TEXT DEFAULT '',
    output_text TEXT DEFAULT '',
    interest_score FLOAT,
    interest_source TEXT DEFAULT 'dashscope',
    feedback FLOAT,
    outcome TEXT,
    latency_ms INT,
    token_usage JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_traces_agent ON agent_traces(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_traces_action ON agent_traces(action);
CREATE INDEX IF NOT EXISTS idx_agent_traces_created ON agent_traces(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_feedback ON agent_traces(feedback) WHERE feedback IS NOT NULL;

-- 2. Skill Records (evolution metrics + history)
CREATE TABLE IF NOT EXISTS skill_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    skill_type TEXT DEFAULT 'soul',              -- soul, rules, knowledge
    origin TEXT DEFAULT 'initial',               -- initial, fix, derived, captured
    version INT DEFAULT 1,
    content_snapshot TEXT,                        -- SOUL.md/RULES.md snapshot
    parent_skill_id TEXT,
    success_count INT DEFAULT 0,
    failure_count INT DEFAULT 0,
    evolution_count INT DEFAULT 0,
    avg_feedback FLOAT DEFAULT 0,
    last_evolved_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(skill_id, version)
);

CREATE INDEX IF NOT EXISTS idx_skill_records_agent ON skill_records(agent_name);
CREATE INDEX IF NOT EXISTS idx_skill_records_origin ON skill_records(origin);

-- 3. Agent Config Versions (brain_config version history)
CREATE TABLE IF NOT EXISTS agent_config_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL,
    version INT NOT NULL,
    config_snapshot JSONB NOT NULL,               -- brain_config full snapshot
    change_reason TEXT,                           -- "trace analysis", "manual", "evolution"
    change_diff JSONB DEFAULT '{}',               -- what changed from previous
    metrics JSONB DEFAULT '{}',                   -- performance metrics at version time
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_name, version)
);

CREATE INDEX IF NOT EXISTS idx_config_versions_agent ON agent_config_versions(agent_name);

-- 4. Agent Shared Memory (team collaboration KV store)
CREATE TABLE IF NOT EXISTS agent_shared_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, agent_name, key)
);

CREATE INDEX IF NOT EXISTS idx_shared_memory_team ON agent_shared_memory(team_id);
