-- Add lineage_version field to atlas_codebase_packets for mandatory schema tracking
ALTER TABLE atlas_codebase_packets
  ADD COLUMN IF NOT EXISTS lineage_version VARCHAR(50) DEFAULT 'packet-identity-v2';

CREATE INDEX IF NOT EXISTS idx_atlas_codebase_packets_lineage_version
  ON atlas_codebase_packets(lineage_version);

-- Update existing rows that don't have the field set
UPDATE atlas_codebase_packets
  SET lineage_version = 'packet-identity-v2'
  WHERE lineage_version IS NULL OR lineage_version = '';
