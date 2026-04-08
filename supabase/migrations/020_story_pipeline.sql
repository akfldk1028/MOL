-- 020: Story Pipeline Enhancement
-- StoryWriter 4-Agent Pipeline support + creative work classification

-- 1. series 테이블 확장: 창작물 분류 + 파이프라인 설정
ALTER TABLE series ADD COLUMN IF NOT EXISTS creative_category VARCHAR(50) DEFAULT 'general';
-- creative_category: 'novel', 'webtoon', 'music', 'video', 'illustration'

ALTER TABLE series ADD COLUMN IF NOT EXISTS sub_genre VARCHAR(100);
-- sub_genre: 'romance_office', 'fantasy_murim', 'mystery_detective', 'thriller_psychological' 등

ALTER TABLE series ADD COLUMN IF NOT EXISTS pipeline_type VARCHAR(50) DEFAULT 'legacy';
-- pipeline_type: 'legacy' (기존 단순 LLM), 'storywriter' (4-Agent Pipeline), 'manual'

ALTER TABLE series ADD COLUMN IF NOT EXISTS pipeline_config JSONB DEFAULT '{}';
-- pipeline_config: { maxEvalRetries, targetWordCount, genre, useKG, model 등 }

ALTER TABLE series ADD COLUMN IF NOT EXISTS character_sheet JSONB DEFAULT '[]';
-- character_sheet: [{ name, age, role, personality, appearance, backstory }]

ALTER TABLE series ADD COLUMN IF NOT EXISTS world_setting TEXT;
-- world_setting: 세계관 설정 (판타지/무협용)

ALTER TABLE series ADD COLUMN IF NOT EXISTS quality_score REAL;
-- quality_score: 최근 에피소드 평균 평가 점수 (HANNA 6-dim)

-- 2. episodes 테이블 확장: 파이프라인 메타데이터
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS pipeline_type VARCHAR(50) DEFAULT 'legacy';
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS pipeline_metadata JSONB DEFAULT '{}';
-- pipeline_metadata: { outline, chapterPlan, evaluation, writeAttempts, durationMs, model }

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS quality_scores JSONB;
-- quality_scores: { relevance, coherence, empathy, surprise, creativity, complexity, overall }

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS sentiment_score REAL;
-- sentiment_score: 0-1 감정 점수 (SCORE 논문)

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_series_creative_category ON series(creative_category);
CREATE INDEX IF NOT EXISTS idx_series_pipeline_type ON series(pipeline_type);
CREATE INDEX IF NOT EXISTS idx_series_sub_genre ON series(sub_genre);
CREATE INDEX IF NOT EXISTS idx_episodes_pipeline_type ON episodes(pipeline_type);
CREATE INDEX IF NOT EXISTS idx_episodes_quality ON episodes((quality_scores->>'overall'));

-- 4. 기존 시리즈 content_type → creative_category 마이그레이션
UPDATE series SET creative_category = content_type WHERE creative_category = 'general';
UPDATE series SET creative_category = 'novel' WHERE content_type = 'novel';
UPDATE series SET creative_category = 'webtoon' WHERE content_type = 'webtoon';
