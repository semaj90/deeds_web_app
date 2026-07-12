-- Phase 2F.1: Backfill tables for qdrant_point_id linking
-- Two new tables: identity conflicts + materialization queue

CREATE TABLE IF NOT EXISTS atlas_packets_identity_conflicts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  packet_id TEXT NOT NULL REFERENCES atlas_packets(packet_id) ON DELETE CASCADE,
  conflict_type VARCHAR(50) NOT NULL,  -- 'multiple_qdrant_points', 'packet_key_mismatch', etc.
  conflict_detail JSONB NOT NULL,      -- {"conflicting_ids": [...], "packet_key": "...", ...}
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE (packet_id, conflict_type)
);

CREATE INDEX IF NOT EXISTS idx_packets_identity_conflicts_type
  ON atlas_packets_identity_conflicts(conflict_type);
CREATE INDEX IF NOT EXISTS idx_packets_identity_conflicts_resolved
  ON atlas_packets_identity_conflicts(resolved_at) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS atlas_packets_materialization_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  packet_id TEXT NOT NULL REFERENCES atlas_packets(packet_id) ON DELETE CASCADE,
  packet_key TEXT NOT NULL,
  corpus_version TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'complete', 'failed'
  error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE (packet_id)
);

CREATE INDEX IF NOT EXISTS idx_packets_materialization_status
  ON atlas_packets_materialization_queue(status) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_packets_materialization_corpus
  ON atlas_packets_materialization_queue(corpus_version);
