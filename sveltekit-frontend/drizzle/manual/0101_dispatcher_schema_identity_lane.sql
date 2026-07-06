/**
 * Session 114 Priority 1: Add missing identity_lane schema
 *
 * Adds 4 critical columns to atlas_packets for dispatcher routing:
 * - identity_lane: 'canonical' | 'recoverable' | 'quarantine'
 * - identity_confidence: 0.0-1.0 confidence score
 * - recovery_lane: tracks which recovery method was used
 * - qdrant_point_id: cross-reference to Qdrant point ID
 */

-- Add missing columns to atlas_packets
ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS identity_lane VARCHAR(50) DEFAULT 'canonical',
  ADD COLUMN IF NOT EXISTS identity_confidence REAL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS recovery_lane VARCHAR(50),
  ADD COLUMN IF NOT EXISTS qdrant_point_id UUID;

-- Add check constraint on valid lanes
ALTER TABLE atlas_packets
  ADD CONSTRAINT check_identity_lane CHECK (
    identity_lane IN ('canonical', 'recoverable', 'quarantine')
  );

-- Add check constraint on confidence
ALTER TABLE atlas_packets
  ADD CONSTRAINT check_identity_confidence CHECK (
    identity_confidence >= 0.0 AND identity_confidence <= 1.0
  );

-- Create indexes for fast dispatcher queries
CREATE INDEX IF NOT EXISTS idx_atlas_packets_identity_lane
  ON atlas_packets(identity_lane, identity_confidence DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_qdrant_point
  ON atlas_packets(qdrant_point_id)
  WHERE qdrant_point_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_packets_recovery_lane
  ON atlas_packets(recovery_lane)
  WHERE recovery_lane IS NOT NULL;

-- Verify schema
SELECT
  COUNT(*) as total_packets,
  COUNT(CASE WHEN identity_lane = 'canonical' THEN 1 END) as canonical,
  COUNT(CASE WHEN identity_lane = 'recoverable' THEN 1 END) as recoverable,
  COUNT(CASE WHEN identity_lane = 'quarantine' THEN 1 END) as quarantine,
  COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) as with_qdrant_id,
  ROUND(AVG(identity_confidence), 4) as avg_confidence
FROM atlas_packets;
