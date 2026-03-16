-- Episode interactions: GIN index for schedule_days filtering
CREATE INDEX IF NOT EXISTS idx_series_schedule_days ON series USING GIN (schedule_days);
