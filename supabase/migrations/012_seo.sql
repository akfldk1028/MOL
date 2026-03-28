-- 012_seo.sql
-- SEO fields for posts and series

ALTER TABLE posts ADD COLUMN IF NOT EXISTS seo_keywords TEXT[];
ALTER TABLE posts ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS seo_optimized BOOLEAN DEFAULT FALSE;

ALTER TABLE series ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS seo_keywords TEXT[];
