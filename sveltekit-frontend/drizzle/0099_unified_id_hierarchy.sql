-- Migration: Add Unified ID Hierarchy to atlas_packets
-- Date: 2026-07-06
-- Purpose: Add 8 canonical ID columns for unified identity across all stores

-- Add 8 canonical ID hierarchy columns to atlas_packets
ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS repository_id UUID,
  ADD COLUMN IF NOT EXISTS directory_id UUID,
  ADD COLUMN IF NOT EXISTS file_id UUID,
  ADD COLUMN IF NOT EXISTS module_id UUID,
  ADD COLUMN IF NOT EXISTS symbol_id UUID,
  ADD COLUMN IF NOT EXISTS chunk_id UUID;

-- Create indexes for ID hierarchy navigation
CREATE INDEX IF NOT EXISTS idx_atlas_packets_repository_id ON atlas_packets(repository_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_directory_id ON atlas_packets(directory_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_file_id ON atlas_packets(file_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_module_id ON atlas_packets(module_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_symbol_id ON atlas_packets(symbol_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_chunk_id ON atlas_packets(chunk_id);

-- Composite index for hierarchy traversal
CREATE INDEX IF NOT EXISTS idx_atlas_packets_hierarchy ON atlas_packets(
  repository_id, directory_id, file_id, module_id, symbol_id, feature_id
);

-- Create audit table for ID hierarchy changes (if not exists)
CREATE TABLE IF NOT EXISTS atlas_id_hierarchy_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key TEXT NOT NULL,
  repository_id UUID,
  directory_id UUID,
  file_id UUID,
  module_id UUID,
  symbol_id UUID,
  feature_id TEXT,
  chunk_id UUID,
  source_ref TEXT,
  directory_path TEXT,
  confidence REAL DEFAULT 1.0,
  last_verified_at TIMESTAMP WITH TIME ZONE,
  verified_by_lane TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(packet_key),
  FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key) ON DELETE CASCADE
);

-- Create index for audit lookups
CREATE INDEX IF NOT EXISTS idx_atlas_id_hierarchy_metadata_packet_key
  ON atlas_id_hierarchy_metadata(packet_key);
CREATE INDEX IF NOT EXISTS idx_atlas_id_hierarchy_metadata_feature_id
  ON atlas_id_hierarchy_metadata(feature_id);
CREATE INDEX IF NOT EXISTS idx_atlas_id_hierarchy_metadata_source_ref
  ON atlas_id_hierarchy_metadata(source_ref);

-- Create view for ID hierarchy coverage stats
CREATE OR REPLACE VIEW v_atlas_id_hierarchy_coverage AS
SELECT
  COUNT(*) AS total_packets,
  COUNT(repository_id) AS repository_id_populated,
  COUNT(directory_id) AS directory_id_populated,
  COUNT(file_id) AS file_id_populated,
  COUNT(module_id) AS module_id_populated,
  COUNT(symbol_id) AS symbol_id_populated,
  COUNT(chunk_id) AS chunk_id_populated,
  ROUND(100.0 * COUNT(repository_id) / COUNT(*), 2) AS repository_id_pct,
  ROUND(100.0 * COUNT(directory_id) / COUNT(*), 2) AS directory_id_pct,
  ROUND(100.0 * COUNT(file_id) / COUNT(*), 2) AS file_id_pct,
  ROUND(100.0 * COUNT(module_id) / COUNT(*), 2) AS module_id_pct,
  ROUND(100.0 * COUNT(symbol_id) / COUNT(*), 2) AS symbol_id_pct,
  ROUND(100.0 * COUNT(chunk_id) / COUNT(*), 2) AS chunk_id_pct
FROM atlas_packets;
