-- Migration: Add Identity Lane Recovery Fields to atlas_packets
-- Date: 2026-07-06
-- Purpose: Support five-lane identity preservation for agentic error fixing
--
-- Lanes:
-- - canonical: packet_key + source_ref + feature_id present
-- - recoverable_by_span: source_ref + byte_start + byte_end present
-- - recoverable_by_hash: source_ref + sha256 present
-- - mirror_orphan: qdrant/neo4j/redis reference present but no canonical key
-- - quarantine: no identity fields available

-- Add lane assignment and recovery fields
ALTER TABLE atlas_packets
ADD COLUMN IF NOT EXISTS identity_lane VARCHAR(50) DEFAULT 'canonical',
ADD COLUMN IF NOT EXISTS recovered_packet_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS identity_confidence DOUBLE PRECISION DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS identity_recovery_reason TEXT,
ADD COLUMN IF NOT EXISTS byte_start BIGINT,
ADD COLUMN IF NOT EXISTS byte_end BIGINT,
ADD COLUMN IF NOT EXISTS sha256 VARCHAR(64),
ADD COLUMN IF NOT EXISTS qdrant_point_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS neo4j_node_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS redis_key VARCHAR(255);

-- Create indexes for lane assignment queries
CREATE INDEX IF NOT EXISTS idx_atlas_packets_identity_lane ON atlas_packets (identity_lane);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_recovered_packet_key ON atlas_packets (recovered_packet_key);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_identity_confidence ON atlas_packets (identity_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_sha256 ON atlas_packets (sha256);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_byte_range ON atlas_packets (byte_start, byte_end);

-- Create audit table for identity lane transitions
CREATE TABLE IF NOT EXISTS identity_audit_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  packet_key VARCHAR(255) NOT NULL,
  lane_before VARCHAR(50) NOT NULL,
  lane_after VARCHAR(50) NOT NULL,
  operation VARCHAR(50) NOT NULL, -- 'assign', 'recover', 'promote', 'demote'
  user_id VARCHAR(255),
  reason TEXT,
  confidence_before DOUBLE PRECISION,
  confidence_after DOUBLE PRECISION,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_audit_packet_key ON identity_audit_logs (packet_key);
CREATE INDEX IF NOT EXISTS idx_identity_audit_timestamp ON identity_audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_identity_audit_operation ON identity_audit_logs (operation);
CREATE INDEX IF NOT EXISTS idx_identity_audit_lane_before ON identity_audit_logs (lane_before);

-- View for lane coverage analysis
CREATE OR REPLACE VIEW v_identity_lane_coverage AS
SELECT
  identity_lane,
  COUNT(*) as packet_count,
  AVG(identity_confidence) as avg_confidence,
  MIN(identity_confidence) as min_confidence,
  MAX(identity_confidence) as max_confidence,
  COUNT(CASE WHEN recovered_packet_key IS NOT NULL THEN 1 END) as recovered_count
FROM atlas_packets
GROUP BY identity_lane
ORDER BY packet_count DESC;

-- View for recovery opportunities
CREATE OR REPLACE VIEW v_identity_recovery_opportunities AS
SELECT
  packet_key,
  source_ref,
  feature_id,
  identity_lane,
  identity_confidence,
  identity_recovery_reason,
  byte_start,
  byte_end,
  sha256,
  CASE
    WHEN identity_lane = 'mirror_orphan' AND qdrant_point_id IS NOT NULL THEN 'qdrant'
    WHEN identity_lane = 'mirror_orphan' AND neo4j_node_id IS NOT NULL THEN 'neo4j'
    WHEN identity_lane = 'mirror_orphan' AND redis_key IS NOT NULL THEN 'redis'
    ELSE NULL
  END as recovery_source
FROM atlas_packets
WHERE identity_lane IN ('recoverable_by_span', 'recoverable_by_hash', 'mirror_orphan')
ORDER BY identity_confidence DESC;

-- Comments for documentation
COMMENT ON TABLE identity_audit_logs IS 'Audit trail for identity lane transitions. Tracks when packets are assigned to, promoted, or demoted from lanes.';
COMMENT ON COLUMN atlas_packets.identity_lane IS 'Lane assignment: canonical, recoverable_by_span, recoverable_by_hash, mirror_orphan, or quarantine';
COMMENT ON COLUMN atlas_packets.recovered_packet_key IS 'Reconstructed packet_key used in recovery lanes';
COMMENT ON COLUMN atlas_packets.identity_confidence IS 'Confidence score (1.0 = canonical, 0.8 = span recovery, 0.6 = hash recovery, 0.1 = mirror orphan, 0.0 = quarantine)';
COMMENT ON COLUMN atlas_packets.identity_recovery_reason IS 'Human-readable reason for recovery assignment or promotion outcome';
