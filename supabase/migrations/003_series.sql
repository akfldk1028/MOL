-- Series table: parent container for serialized content (webtoons, novels, music albums, etc.)
CREATE TABLE IF NOT EXISTS series (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            VARCHAR(120) NOT NULL UNIQUE,
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  cover_image_url TEXT,

  -- Type & categorization
  content_type    VARCHAR(20) NOT NULL DEFAULT 'novel',   -- novel, webtoon, music, illustration, screenplay, book, contest
  genre           VARCHAR(50),
  tags            TEXT[] DEFAULT '{}',
  domain_slug     VARCHAR(32),

  -- Status
  status          VARCHAR(20) NOT NULL DEFAULT 'ongoing', -- ongoing, completed, hiatus, dropped

  -- Authorship (one of these is set)
  created_by_user_id  TEXT REFERENCES users(id),
  created_by_agent_id TEXT REFERENCES agents(id),

  -- Serialization schedule (e.g., ["mon","thu"])
  schedule_days   TEXT[] DEFAULT '{}',

  -- Denormalized counters
  episode_count     INT NOT NULL DEFAULT 0,
  subscriber_count  INT NOT NULL DEFAULT 0,
  total_views       INT NOT NULL DEFAULT 0,
  total_comments    INT NOT NULL DEFAULT 0,

  -- Timestamps
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_series_content_type ON series(content_type);
CREATE INDEX idx_series_status ON series(status);
CREATE INDEX idx_series_created_by_user ON series(created_by_user_id);
CREATE INDEX idx_series_created_by_agent ON series(created_by_agent_id);
CREATE INDEX idx_series_created_at ON series(created_at DESC);
CREATE INDEX idx_series_slug ON series(slug);

-- Add series fields to creations (existing standalone creations keep series_id = NULL)
ALTER TABLE creations
  ADD COLUMN IF NOT EXISTS series_id       UUID REFERENCES series(id),
  ADD COLUMN IF NOT EXISTS episode_number  INT,          -- display number (what users see: 1화, 2화...)
  ADD COLUMN IF NOT EXISTS position        INT,          -- internal sort order (allows reordering)
  ADD COLUMN IF NOT EXISTS volume_label    VARCHAR(50),  -- optional grouping: "Season 2", "Part 1", etc.
  ADD COLUMN IF NOT EXISTS published_at    TIMESTAMPTZ;  -- scheduled publish (distinct from created_at)

CREATE INDEX idx_creations_series ON creations(series_id);
CREATE INDEX idx_creations_series_pos ON creations(series_id, position);

-- Series subscriptions
CREATE TABLE IF NOT EXISTS series_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id  UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(series_id, user_id)
);

CREATE INDEX idx_series_subs_user ON series_subscriptions(user_id);
CREATE INDEX idx_series_subs_series ON series_subscriptions(series_id);
