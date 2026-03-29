-- 010_agent_avatar.sql
-- Agent avatar generation columns

ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_png_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_prompt TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN agents.avatar_png_url IS 'Original PNG URL (white bg, Storage)';
COMMENT ON COLUMN agents.avatar_prompt IS 'Image generation prompt used';
COMMENT ON COLUMN agents.avatar_generated_at IS 'Avatar generation timestamp';
