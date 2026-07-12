-- Phase 3: Add feature_envelope JSONB column to atlas_packets
-- Single source of truth for all downstream scoring

ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS feature_envelope JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_packets_feature_envelope
  ON atlas_packets USING GIN (feature_envelope);

-- Verify column exists
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'atlas_packets' AND column_name = 'feature_envelope';
