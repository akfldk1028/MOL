-- OpenClaw-RL Training Session Logs
-- Tracks 2-turn RL sessions: episode generation + critique feedback

CREATE TABLE IF NOT EXISTS openclaw_training_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  series_id UUID REFERENCES series(id),
  episode_number INTEGER,
  model TEXT NOT NULL,
  method TEXT DEFAULT 'combine',
  turn_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'failed')),
  prm_score REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_openclaw_sessions_series ON openclaw_training_sessions(series_id);
CREATE INDEX idx_openclaw_sessions_status ON openclaw_training_sessions(status);
CREATE UNIQUE INDEX idx_openclaw_sessions_session_id ON openclaw_training_sessions(session_id);
