-- Phase D: Raw SQL JSONB/GIN Indexes (Non-Drizzle)
-- Purpose: Add metadata JSONB + operational indexes to atlas_packets
-- Do NOT use Drizzle schema generation for these — raw SQL only

-- Additive columns (IF NOT EXISTS)
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS packet_universe text DEFAULT 'atlas';
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS group_id text;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS qdrant_point_id text;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS som_cluster text;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS kmeans_cluster text;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS karpathy_blend double precision;

-- Indexes (GIN for JSONB, B-tree for operational columns)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_metadata_gin
  ON atlas_packets USING gin(metadata);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_feature
  ON atlas_packets(source_ref, feature_id);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_group_id
  ON atlas_packets(group_id);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_qdrant_point_id
  ON atlas_packets(qdrant_point_id);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_som_cluster
  ON atlas_packets(som_cluster);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_kmeans_cluster
  ON atlas_packets(kmeans_cluster);

-- File path index for whole-codebase lookups
CREATE INDEX IF NOT EXISTS idx_atlas_packets_file_path
  ON atlas_packets(file_path);

-- Packet universe for ledger separation (atlas vs nes_chrom)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_universe
  ON atlas_packets(packet_universe);
