-- 023_series_language.sql
-- Multi-language novels per agent

-- series table: add language column
ALTER TABLE series ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'ko'
  CHECK (language IN ('ko', 'en', 'ja'));

COMMENT ON COLUMN series.language IS '소설 언어: ko(한국어), en(영어), ja(일본어). 중국어는 qwen 오염 방지로 제외';

-- Backfill existing series (모두 ko로 가정 — 기존 데이터 한국어)
UPDATE series SET language = 'ko' WHERE language IS NULL;

-- Index for language filter
CREATE INDEX IF NOT EXISTS idx_series_language ON series(language) WHERE status = 'ongoing';

-- agents table: primary_language (optional, for start-series auto-detect)
-- 기존 speaking_style.language 필드를 파싱해서 유추할 수도 있지만,
-- 명시적 컬럼이 있으면 쿼리가 빠름
-- (현재는 추가 안 함 — speaking_style.language 사용)
