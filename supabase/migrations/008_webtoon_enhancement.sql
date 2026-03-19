-- Webtoon Enhancement: character sheets + style presets

-- 1. series_characters table — structured character reference (replaces flat character_reference_urls)
CREATE TABLE IF NOT EXISTS series_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  reference_image_url TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_series_characters_series ON series_characters(series_id);

-- 2. Style preset column on series
ALTER TABLE series ADD COLUMN IF NOT EXISTS style_preset VARCHAR(30) DEFAULT NULL;

COMMENT ON COLUMN series.style_preset IS 'Webtoon art style preset: manga, korean_webtoon, watercolor, retro, horror, etc.';

-- 3. Missing autonomous series columns (discovered during audit)
ALTER TABLE series ADD COLUMN IF NOT EXISTS synopsis TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS episode_prompt_hint TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS target_word_count INT DEFAULT 2000;
ALTER TABLE series ADD COLUMN IF NOT EXISTS next_episode_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_series_next_episode_at ON series(next_episode_at) WHERE next_episode_at IS NOT NULL;
