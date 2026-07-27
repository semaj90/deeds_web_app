-- Phase 109: Unknown Packet Resolution Tables
-- Schema for 4-stage ingestion pipeline (Observation → Candidate → Validated → Promoted)

-- Table 1: unknown_packets
-- Tracks unknown packet progression through resolution stages
CREATE TABLE IF NOT EXISTS unknown_packets (
  -- Identity
  unknown_id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL UNIQUE,

  -- Proposed identity
  workspace_id VARCHAR(256) NOT NULL,
  potential_source_ref TEXT NOT NULL,
  potential_feature_id VARCHAR(256),
  potential_feature_label VARCHAR(512),
  potential_packet_key TEXT,

  -- Stage tracking (OBSERVATION → CANDIDATE → VALIDATED → PROMOTED / REJECTED)
  status VARCHAR(32) NOT NULL DEFAULT 'OBSERVATION',

  -- Scoring (Stage 2 - Candidate Scorer)
  identity_score REAL,
  semantic_score REAL,
  source_score REAL,
  topology_score REAL,
  freshness_score REAL,
  combined_score REAL,

  -- Evidence proofs (Stage 3 - Evidence Validator)
  identity_proof VARCHAR(16),    -- PASS/FAIL
  semantic_proof VARCHAR(16),    -- PASS/WARN/FAIL
  topology_proof VARCHAR(16),    -- PASS/WARN/FAIL
  lineage_proof VARCHAR(16),     -- PASS/WARN/FAIL
  content_proof VARCHAR(16),     -- PASS/WARN/FAIL

  -- Promotion outcome (Stage 4 - Promotion Executor)
  promoted_packet_key TEXT,
  promotion_timestamp TIMESTAMP,
  rejection_reason TEXT,
  analyst_notes TEXT,

  -- Metadata
  source_kind VARCHAR(32) NOT NULL,  -- scanner|ldr|user_submission|edge_case
  evidence_payload JSONB,
  ledger_hash TEXT,

  -- Timestamps
  ingested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  scored_at TIMESTAMP,
  validated_at TIMESTAMP,
  resolved_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unknown_status_valid CHECK (status IN ('OBSERVATION', 'CANDIDATE', 'VALIDATED', 'PROMOTED', 'REJECTED')),
  CONSTRAINT unknown_proof_valid CHECK (identity_proof IS NULL OR identity_proof IN ('PASS', 'FAIL')),
  CONSTRAINT unknown_source_kind_valid CHECK (source_kind IN ('scanner', 'ldr', 'user_submission', 'edge_case'))
);

-- Indexes for unknown_packets
CREATE INDEX IF NOT EXISTS idx_unknown_status ON unknown_packets(status);
CREATE INDEX IF NOT EXISTS idx_unknown_workspace ON unknown_packets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_unknown_source_ref ON unknown_packets(potential_source_ref);
CREATE INDEX IF NOT EXISTS idx_unknown_combined_score ON unknown_packets(combined_score DESC);
CREATE INDEX IF NOT EXISTS idx_unknown_ingested_at ON unknown_packets(ingested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unknown_identity_unique ON unknown_packets(workspace_id, potential_source_ref);

-- Table 2: unknown_resolution_ledger
-- Audit trail for every gate and stage transition
CREATE TABLE IF NOT EXISTS unknown_resolution_ledger (
  -- Identity
  ledger_id TEXT PRIMARY KEY,
  unknown_id TEXT NOT NULL REFERENCES unknown_packets(unknown_id) ON DELETE CASCADE,

  -- Stage progression
  stage VARCHAR(32) NOT NULL,    -- OBSERVATION|CANDIDATE|VALIDATED|PROMOTED|REJECTED
  gate_name VARCHAR(256) NOT NULL,
  gate_result VARCHAR(16),       -- PASS|FAIL|WARN

  -- Evidence
  check_description TEXT,
  check_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  evidence_summary JSONB,

  -- Action taken
  action_taken VARCHAR(256),
  action_timestamp TIMESTAMP,

  -- Constraints
  CONSTRAINT ledger_stage_valid CHECK (stage IN ('OBSERVATION', 'CANDIDATE', 'VALIDATED', 'PROMOTED', 'REJECTED')),
  CONSTRAINT ledger_result_valid CHECK (gate_result IS NULL OR gate_result IN ('PASS', 'FAIL', 'WARN'))
);

-- Indexes for unknown_resolution_ledger
CREATE INDEX IF NOT EXISTS idx_ledger_unknown ON unknown_resolution_ledger(unknown_id);
CREATE INDEX IF NOT EXISTS idx_ledger_stage ON unknown_resolution_ledger(stage);
CREATE INDEX IF NOT EXISTS idx_ledger_timestamp ON unknown_resolution_ledger(check_timestamp DESC);

-- Verification queries (run after migration)
-- SELECT COUNT(*) FROM unknown_packets;  -- Expected: 0
-- SELECT COUNT(*) FROM unknown_resolution_ledger;  -- Expected: 0
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'unknown_packets' ORDER BY ordinal_position;
