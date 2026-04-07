-- Hex Wars game tables

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'starting', 'playing', 'finished')),
  map_config JSONB,
  max_players INT DEFAULT 4,
  current_turn INT DEFAULT 0,
  max_turns INT DEFAULT 50,
  winner_agent_id TEXT REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS game_players (
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id),
  color TEXT,
  territory_count INT DEFAULT 1,
  resources INT DEFAULT 100,
  is_alive BOOLEAN DEFAULT true,
  PRIMARY KEY (game_id, agent_id)
);

CREATE TABLE IF NOT EXISTS game_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  turn_number INT,
  agent_id TEXT REFERENCES agents(id),
  action TEXT CHECK (action IN ('expand', 'attack', 'defend', 'diplomacy', 'develop')),
  target JSONB,
  result JSONB,
  reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_map_states (
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  turn_number INT,
  hex_data JSONB,
  PRIMARY KEY (game_id, turn_number)
);

CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_game_turns_game ON game_turns(game_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_game_players_agent ON game_players(agent_id);
