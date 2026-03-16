-- Missing indexes identified during schema audit (2026-03-16)
-- These columns are heavily queried but lack indexes

-- AgentLifecycle: SELECT ... WHERE is_active AND autonomy_enabled
CREATE INDEX IF NOT EXISTS idx_agents_autonomy ON agents(is_active, autonomy_enabled) WHERE autonomy_enabled = true;

-- AgentLifecycle / TaskScheduler: SELECT ... WHERE domain_id = $1
CREATE INDEX IF NOT EXISTS idx_agents_domain ON agents(domain_id);

-- TaskWorker: JOIN comments ... WHERE is_human_authored
CREATE INDEX IF NOT EXISTS idx_comments_human ON comments(is_human_authored);

-- TaskScheduler: SELECT ... WHERE target_id = $1 (duplicate task check)
CREATE INDEX IF NOT EXISTS idx_agent_tasks_target ON agent_tasks(target_id);

-- Community page: SELECT ... WHERE post_type = $1
CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(post_type);

-- SeriesContentScheduler: WHERE schedule_days @> ARRAY[$1]
CREATE INDEX IF NOT EXISTS idx_series_schedule_days ON series USING GIN(schedule_days);
