-- Phase 106: Retrieval Attempt Arbitration Layer
-- Tracks all retrieval attempts (A=Dense, B=Topology, C=DAG)
-- and promotes winners to cache

CREATE TABLE IF NOT EXISTS retrieval_attempts (
  attempt_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  task_id TEXT,
  query_hash TEXT NOT NULL,
  method TEXT NOT NULL,
  packet_keys TEXT[] NOT NULL DEFAULT '{}',
  score DOUBLE PRECISION,
  confidence DOUBLE PRECISION,
  latency_ms INTEGER,
  result_hash TEXT,
  cache_tier TEXT,
  superseded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retrieval_attempt_winners (
  query_hash TEXT PRIMARY KEY,
  winning_attempt_id TEXT NOT NULL REFERENCES retrieval_attempts(attempt_id),
  packet_keys TEXT[] NOT NULL DEFAULT '{}',
  cache_key TEXT,
  promoted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_retrieval_attempts_query_hash ON retrieval_attempts(query_hash);
CREATE INDEX IF NOT EXISTS idx_retrieval_attempts_trace_id ON retrieval_attempts(trace_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_attempts_method ON retrieval_attempts(method);
CREATE INDEX IF NOT EXISTS idx_retrieval_attempts_created_at ON retrieval_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retrieval_attempt_winners_query_hash ON retrieval_attempt_winners(query_hash);

-- Add new columns to atlas_packet_metrics for NB evidence + HMM decision
ALTER TABLE atlas_packet_metrics
ADD COLUMN IF NOT EXISTS naive_bayes_evidence JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS hmm_decision JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS acp_action JSONB DEFAULT '{}'::jsonb;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON retrieval_attempts TO legal_admin;
GRANT SELECT, INSERT, UPDATE ON retrieval_attempt_winners TO legal_admin;
