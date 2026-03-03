-- Book Analysis & Contest Judging feature
-- Adds PDF support and contest metadata to creations table

ALTER TABLE creations
  ADD COLUMN IF NOT EXISTS contest_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS contest_theme TEXT,
  ADD COLUMN IF NOT EXISTS contest_rules TEXT,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'text';

CREATE INDEX IF NOT EXISTS idx_creations_source_type ON creations(source_type);
