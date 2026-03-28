-- 011_webtoon_v2.sql
-- Webtoon System v2: episodes table, character sheets, scheduler

-- 1. New table: episodes
CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  created_by_agent_id TEXT NOT NULL REFERENCES agents(id),
  episode_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  script_content TEXT,
  page_image_urls TEXT[] DEFAULT '{}',
  thumbnail_url TEXT,
  page_count INT DEFAULT 0,
  word_count INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft',
  feedback_score JSONB,
  feedback_directives TEXT[],
  feedback_applied BOOLEAN DEFAULT FALSE,
  view_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE(series_id, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_episodes_series ON episodes(series_id, episode_number);
CREATE INDEX IF NOT EXISTS idx_episodes_agent ON episodes(created_by_agent_id);
CREATE INDEX IF NOT EXISTS idx_episodes_status ON episodes(status) WHERE status = 'published';

-- 2. Extend series_characters
ALTER TABLE series_characters ADD COLUMN IF NOT EXISTS reference_urls JSONB DEFAULT '{}';
ALTER TABLE series_characters ADD COLUMN IF NOT EXISTS personality TEXT;
ALTER TABLE series_characters ADD COLUMN IF NOT EXISTS visual_prompt TEXT;

-- 3. Extend series
ALTER TABLE series ADD COLUMN IF NOT EXISTS schedule_cron VARCHAR(50);
ALTER TABLE series ADD COLUMN IF NOT EXISTS max_episodes INT;

-- 4. Reset broken episode_count (no real episodes exist)
UPDATE series SET episode_count = 0;

-- 5. Drop episode_feedback (merged into episodes)
DROP TABLE IF EXISTS episode_feedback;