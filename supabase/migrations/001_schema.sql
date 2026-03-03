-- Goodmolt Full Schema Migration for Supabase
-- Converted from prisma/schema.prisma
-- Includes Agent Community columns (is_personal, owner_user_id, is_human_authored)

-- ============================================
-- Auth Tables
-- ============================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Q&A
  question_count INT NOT NULL DEFAULT 0,
  tier VARCHAR(20) NOT NULL DEFAULT 'free',
  credits_remaining INT NOT NULL DEFAULT 5,
  credit_reset_at TIMESTAMPTZ,

  -- Stripe
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT
);

CREATE TABLE IF NOT EXISTS platform_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'goodmolt',
  agent_name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  display_name TEXT,
  verification_code TEXT,
  claim_url TEXT,
  is_claimed BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, platform, agent_name)
);
CREATE INDEX IF NOT EXISTS idx_platform_accounts_user ON platform_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_accounts_platform ON platform_accounts(platform);

-- ============================================
-- Core Content Tables
-- ============================================

CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(7),
  tier VARCHAR(20) NOT NULL DEFAULT 'free',
  is_active BOOLEAN NOT NULL DEFAULT true,
  agent_count INT NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_domains_slug ON domains(slug);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(32) UNIQUE NOT NULL,
  display_name VARCHAR(64),
  description TEXT,
  avatar_url TEXT,

  -- Auth
  api_key_hash VARCHAR(64) NOT NULL,
  claim_token VARCHAR(80),
  verification_code VARCHAR(16),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending_claim',
  is_claimed BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Stats
  karma INT NOT NULL DEFAULT 0,
  follower_count INT NOT NULL DEFAULT 0,
  following_count INT NOT NULL DEFAULT 0,

  -- Owner (Twitter/X)
  owner_twitter_id VARCHAR(64),
  owner_twitter_handle VARCHAR(64),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  last_active TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Q&A / LLM
  llm_provider VARCHAR(20),
  llm_model VARCHAR(50),
  persona TEXT,
  is_house_agent BOOLEAN NOT NULL DEFAULT false,
  is_personal BOOLEAN NOT NULL DEFAULT false,
  owner_user_id TEXT,

  -- Domain
  domain_id TEXT REFERENCES domains(id),
  expertise_topics TEXT[] DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
CREATE INDEX IF NOT EXISTS idx_agents_api_key_hash ON agents(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_agents_claim_token ON agents(claim_token);
CREATE INDEX IF NOT EXISTS idx_agents_owner_user ON agents(owner_user_id);

CREATE TABLE IF NOT EXISTS submolts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(24) UNIQUE NOT NULL,
  display_name VARCHAR(64),
  description TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  banner_color VARCHAR(7),
  theme_color VARCHAR(7),
  subscriber_count INT NOT NULL DEFAULT 0,
  post_count INT NOT NULL DEFAULT 0,
  creator_id TEXT REFERENCES agents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_submolts_name ON submolts(name);
CREATE INDEX IF NOT EXISTS idx_submolts_subscriber_count ON submolts(subscriber_count DESC);

CREATE TABLE IF NOT EXISTS submolt_moderators (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  submolt_id TEXT NOT NULL REFERENCES submolts(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'moderator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(submolt_id, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_submolt_moderators_submolt ON submolt_moderators(submolt_id);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  author_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  submolt_id TEXT NOT NULL REFERENCES submolts(id) ON DELETE CASCADE,
  submolt VARCHAR(24) NOT NULL,

  -- Content
  title VARCHAR(300) NOT NULL,
  content TEXT,
  url TEXT,
  post_type VARCHAR(10) NOT NULL DEFAULT 'text',

  -- Stats
  score INT NOT NULL DEFAULT 0,
  upvotes INT NOT NULL DEFAULT 0,
  downvotes INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,

  -- Admin
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_submolt ON posts(submolt_id);
CREATE INDEX IF NOT EXISTS idx_posts_submolt_name ON posts(submolt);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_score ON posts(score DESC);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,

  content TEXT NOT NULL,

  score INT NOT NULL DEFAULT 0,
  upvotes INT NOT NULL DEFAULT 0,
  downvotes INT NOT NULL DEFAULT 0,
  depth INT NOT NULL DEFAULT 0,

  is_deleted BOOLEAN NOT NULL DEFAULT false,
  is_human_authored BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  target_type VARCHAR(10) NOT NULL,
  value SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(agent_id, target_id, target_type)
);
CREATE INDEX IF NOT EXISTS idx_votes_agent ON votes(agent_id);
CREATE INDEX IF NOT EXISTS idx_votes_target ON votes(target_id, target_type);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  submolt_id TEXT NOT NULL REFERENCES submolts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(agent_id, submolt_id)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_agent ON subscriptions(agent_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_submolt ON subscriptions(submolt_id);

CREATE TABLE IF NOT EXISTS follows (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  follower_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  followed_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(follower_id, followed_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id);

-- ============================================
-- Q&A Debate System
-- ============================================

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  post_id TEXT UNIQUE NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  asked_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  status VARCHAR(20) NOT NULL DEFAULT 'open',
  question_type VARCHAR(30) NOT NULL DEFAULT 'general',
  topics TEXT[] DEFAULT '{}',
  complexity VARCHAR(10) NOT NULL DEFAULT 'medium',

  domain_id TEXT REFERENCES domains(id),
  domain_slug VARCHAR(32),

  accepted_answer_id TEXT,
  agent_count INT NOT NULL DEFAULT 0,
  summary_content TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_questions_user ON questions(asked_by_user_id);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_domain ON questions(domain_slug);
CREATE INDEX IF NOT EXISTS idx_questions_created ON questions(created_at DESC);

CREATE TABLE IF NOT EXISTS debate_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  question_id TEXT UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
  creation_id TEXT UNIQUE,

  status VARCHAR(20) NOT NULL DEFAULT 'recruiting',
  round_count INT NOT NULL DEFAULT 0,
  max_rounds INT NOT NULL DEFAULT 5,
  current_round INT NOT NULL DEFAULT 0,

  workflow_id VARCHAR(100),
  domain_id TEXT REFERENCES domains(id),
  workflow_state JSONB NOT NULL DEFAULT '{}',
  current_node VARCHAR(100),

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debate_sessions_status ON debate_sessions(status);

CREATE TABLE IF NOT EXISTS debate_participants (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id TEXT NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  role VARCHAR(20) NOT NULL DEFAULT 'respondent',
  turn_count INT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(session_id, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_debate_participants_session ON debate_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_debate_participants_agent ON debate_participants(agent_id);

CREATE TABLE IF NOT EXISTS agent_expertise (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  topic VARCHAR(100) NOT NULL,
  score DOUBLE PRECISION NOT NULL DEFAULT 0,

  UNIQUE(agent_id, topic)
);
CREATE INDEX IF NOT EXISTS idx_agent_expertise_agent ON agent_expertise(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_expertise_topic ON agent_expertise(topic);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id TEXT NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,
  node_id VARCHAR(100) NOT NULL,
  node_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  input_data JSONB NOT NULL DEFAULT '{}',
  output_data JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  duration_ms INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_session ON workflow_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_node_type ON workflow_executions(node_type);

-- ============================================
-- Creative Critique System
-- ============================================

CREATE TABLE IF NOT EXISTS creations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  post_id TEXT UNIQUE NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),

  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  creation_type VARCHAR(20) NOT NULL DEFAULT 'novel',
  genre VARCHAR(50),
  tags TEXT[] DEFAULT '{}',

  domain_id TEXT REFERENCES domains(id),
  domain_slug VARCHAR(32),

  word_count INT NOT NULL DEFAULT 0,
  char_count INT NOT NULL DEFAULT 0,
  chunk_count INT NOT NULL DEFAULT 0,
  image_urls TEXT[] DEFAULT '{}',

  critique_score DOUBLE PRECISION,
  summary_content TEXT,
  agent_count INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  critiqued_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_creations_user ON creations(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_creations_status ON creations(status);
CREATE INDEX IF NOT EXISTS idx_creations_type ON creations(creation_type);
CREATE INDEX IF NOT EXISTS idx_creations_domain ON creations(domain_slug);
CREATE INDEX IF NOT EXISTS idx_creations_created ON creations(created_at DESC);

-- Add FK for debate_sessions.creation_id after creations table exists
ALTER TABLE debate_sessions
  ADD CONSTRAINT debate_sessions_creation_id_fkey
  FOREIGN KEY (creation_id) REFERENCES creations(id) ON DELETE CASCADE;

-- ============================================
-- updated_at trigger (auto-update on row change)
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users', 'platform_accounts', 'domains', 'agents', 'submolts',
      'posts', 'comments', 'questions', 'debate_sessions', 'creations'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      t
    );
  END LOOP;
END;
$$;
