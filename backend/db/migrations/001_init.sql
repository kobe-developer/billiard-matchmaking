-- ============================================================
-- Billiard Matchmaking - DATABASE MIGRATION
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id        SERIAL PRIMARY KEY,
  username  VARCHAR(50) NOT NULL UNIQUE,
  password  VARCHAR(255) NOT NULL,
  role      VARCHAR(10) NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: players
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
  id            SERIAL PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  avatar        VARCHAR(255),
  hc            VARCHAR(5) CHECK (hc IN ('3B', '3A', '3+', '4B', '4A', '4+')),
  points        INTEGER NOT NULL DEFAULT 100,
  win           INTEGER NOT NULL DEFAULT 0,
  lose          INTEGER NOT NULL DEFAULT 0,
  daily_match   INTEGER NOT NULL DEFAULT 0,
  streak        INTEGER NOT NULL DEFAULT 0,
  cooldown_until TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_account_id ON players(account_id);
CREATE INDEX IF NOT EXISTS idx_players_points ON players(points DESC);

-- ============================================================
-- TABLE: match_sessions (queue & active rooms)
-- ============================================================
CREATE TABLE IF NOT EXISTS match_sessions (
  id          SERIAL PRIMARY KEY,
  player1_id  INTEGER NOT NULL REFERENCES players(id),
  player2_id  INTEGER REFERENCES players(id),
  status      VARCHAR(20) NOT NULL DEFAULT 'queue'
              CHECK (status IN ('queue', 'waiting_ready', 'active', 'canceled', 'completed')),
  player1_ready BOOLEAN NOT NULL DEFAULT FALSE,
  player2_ready BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_sessions_status ON match_sessions(status);
CREATE INDEX IF NOT EXISTS idx_match_sessions_player1 ON match_sessions(player1_id);
CREATE INDEX IF NOT EXISTS idx_match_sessions_player2 ON match_sessions(player2_id);

-- ============================================================
-- TABLE: match_history
-- ============================================================
CREATE TABLE IF NOT EXISTS match_history (
  id          SERIAL PRIMARY KEY,
  player1_id  INTEGER NOT NULL REFERENCES players(id),
  player2_id  INTEGER NOT NULL REFERENCES players(id),
  winner_id   INTEGER REFERENCES players(id),
  points_gained INTEGER NOT NULL DEFAULT 0,
  penalty_applied INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_history_player1 ON match_history(player1_id);
CREATE INDEX IF NOT EXISTS idx_match_history_player2 ON match_history(player2_id);
CREATE INDEX IF NOT EXISTS idx_match_history_created ON match_history(created_at DESC);
