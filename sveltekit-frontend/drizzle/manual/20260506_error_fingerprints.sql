-- Multi-index memory engine: error fingerprint store
-- Run: psql $DATABASE_URL -f drizzle/manual/20260506_error_fingerprints.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS error_fingerprints (
  error_hash      TEXT        PRIMARY KEY,
  normalized_text TEXT        NOT NULL,
  raw_text        TEXT        NOT NULL,
  top_symbols     TEXT[]      NOT NULL DEFAULT '{}',
  top_files       TEXT[]      NOT NULL DEFAULT '{}',
  prior_fix       TEXT,
  confidence      REAL        NOT NULL DEFAULT 0.5,
  seen_count      INTEGER     NOT NULL DEFAULT 1,
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GIN trigram index for fast similarity(normalized_text, $query) recall
CREATE INDEX IF NOT EXISTS error_fingerprints_normalized_trgm_idx
  ON error_fingerprints
  USING GIN (normalized_text gin_trgm_ops);

-- GIN array indexes for top_files / top_symbols lookup
CREATE INDEX IF NOT EXISTS error_fingerprints_top_files_gin_idx
  ON error_fingerprints USING GIN (top_files);

CREATE INDEX IF NOT EXISTS error_fingerprints_top_symbols_gin_idx
  ON error_fingerprints USING GIN (top_symbols);

-- Full-text index on normalized_text for plainto_tsquery lane
CREATE INDEX IF NOT EXISTS error_fingerprints_fts_idx
  ON error_fingerprints
  USING GIN (to_tsvector('english', normalized_text));

-- ACE hit log: audit trail of which lane scored for which query
CREATE TABLE IF NOT EXISTS ace_hit_logs (
  id          BIGSERIAL   PRIMARY KEY,
  query_hash  TEXT        NOT NULL,
  lane        TEXT        NOT NULL,   -- 'hash' | 'ngram' | 'graph' | 'ace_cache' | 'vector'
  hit_id      TEXT        NOT NULL,
  score       REAL        NOT NULL,
  file_path   TEXT,
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ace_hit_logs_query_hash_idx ON ace_hit_logs (query_hash);
CREATE INDEX IF NOT EXISTS ace_hit_logs_lane_idx       ON ace_hit_logs (lane);
CREATE INDEX IF NOT EXISTS ace_hit_logs_logged_at_idx  ON ace_hit_logs (logged_at DESC);
