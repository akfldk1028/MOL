-- Character reference images for webtoon series (Nano Banana consistency)
ALTER TABLE series ADD COLUMN IF NOT EXISTS character_reference_urls TEXT[] DEFAULT '{}';

COMMENT ON COLUMN series.character_reference_urls IS 'Reference image URLs for character consistency across episodes (auto-captured from first episode panels)';
