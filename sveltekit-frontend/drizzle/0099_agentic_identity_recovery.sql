-- Migration: Add Unified ID Hierarchy to atlas_packets
-- Date: 2026-07-06
-- Purpose: Store 8-level ID hierarchy (repository → directory → file → module → symbol → feature → packet → chunk)
-- All stores (Postgres/Qdrant/Neo4j/Redis) will reference these same IDs

-- Add 8 columns to atlas_packets if they don't exist
ALTER TABLE atlas_packets
ADD COLUMN IF NOT EXISTS repository_id UUID,
ADD COLUMN IF NOT EXISTS directory_id UUID,
ADD COLUMN IF NOT EXISTS file_id UUID,
ADD COLUMN IF NOT EXISTS module_id UUID,
ADD COLUMN IF NOT EXISTS symbol_id UUID,
ADD COLUMN IF NOT EXISTS feature_id_new VARCHAR(255),  -- Rename from existing feature_id if conflict
ADD COLUMN IF NOT EXISTS chunk_id UUID;

-- Create indexes for efficient filtering by each level
CREATE INDEX IF NOT EXISTS idx_atlas_packets_repository_id ON atlas_packets (repository_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_directory_id ON atlas_packets (directory_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_file_id ON atlas_packets (file_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_module_id ON atlas_packets (module_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_symbol_id ON atlas_packets (symbol_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_feature_id_new ON atlas_packets (feature_id_new);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_chunk_id ON atlas_packets (chunk_id);

-- Composite index for common grouping operations
CREATE INDEX IF NOT EXISTS idx_atlas_packets_hierarchy ON atlas_packets (
  repository_id,
  directory_id,
  file_id,
  module_id,
  symbol_id
);

-- Add constraint: packet_key must be unique (primary identity)
ALTER TABLE atlas_packets
ADD CONSTRAINT uk_atlas_packets_packet_key UNIQUE (packet_key) ON CONFLICT DO NOTHING;

-- Create support table for ID generation metadata (optional, but useful for backfill)
CREATE TABLE IF NOT EXISTS atlas_id_hierarchy_metadata (
  packet_key VARCHAR(255) PRIMARY KEY,
  repository_id UUID NOT NULL,
  directory_id UUID NOT NULL,
  file_id UUID NOT NULL,
  module_id UUID NOT NULL,
  symbol_id UUID NOT NULL,
  feature_id VARCHAR(255) NOT NULL,
  chunk_id UUID,
  source_ref VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  backfill_status VARCHAR(50) DEFAULT 'pending' -- 'pending', 'processing', 'complete', 'failed'
);

CREATE INDEX IF NOT EXISTS idx_id_hierarchy_source_ref ON atlas_id_hierarchy_metadata (source_ref);
CREATE INDEX IF NOT EXISTS idx_id_hierarchy_feature_id ON atlas_id_hierarchy_metadata (feature_id);
CREATE INDEX IF NOT EXISTS idx_id_hierarchy_status ON atlas_id_hierarchy_metadata (backfill_status);

-- Create validation view: check coverage of ID hierarchy
CREATE OR REPLACE VIEW v_atlas_id_hierarchy_coverage AS
SELECT
  COUNT(*) as total_packets,
  COUNT(CASE WHEN repository_id IS NOT NULL THEN 1 END) as repository_id_populated,
  COUNT(CASE WHEN directory_id IS NOT NULL THEN 1 END) as directory_id_populated,
  COUNT(CASE WHEN file_id IS NOT NULL THEN 1 END) as file_id_populated,
  COUNT(CASE WHEN module_id IS NOT NULL THEN 1 END) as module_id_populated,
  COUNT(CASE WHEN symbol_id IS NOT NULL THEN 1 END) as symbol_id_populated,
  COUNT(CASE WHEN feature_id_new IS NOT NULL THEN 1 END) as feature_id_populated,
  COUNT(CASE WHEN chunk_id IS NOT NULL THEN 1 END) as chunk_id_populated,
  ROUND(100.0 * COUNT(CASE WHEN repository_id IS NOT NULL THEN 1 END) / COUNT(*), 2) as repository_id_pct,
  ROUND(100.0 * COUNT(CASE WHEN directory_id IS NOT NULL THEN 1 END) / COUNT(*), 2) as directory_id_pct,
  ROUND(100.0 * COUNT(CASE WHEN file_id IS NOT NULL THEN 1 END) / COUNT(*), 2) as file_id_pct,
  ROUND(100.0 * COUNT(CASE WHEN module_id IS NOT NULL THEN 1 END) / COUNT(*), 2) as module_id_pct,
  ROUND(100.0 * COUNT(CASE WHEN symbol_id IS NOT NULL THEN 1 END) / COUNT(*), 2) as symbol_id_pct,
  ROUND(100.0 * COUNT(CASE WHEN feature_id_new IS NOT NULL THEN 1 END) / COUNT(*), 2) as feature_id_pct,
  ROUND(100.0 * COUNT(CASE WHEN chunk_id IS NOT NULL THEN 1 END) / COUNT(*), 2) as chunk_id_pct
FROM atlas_packets;

-- Add comment for documentation
COMMENT ON TABLE atlas_packets IS 'Canonical packet identity with 8-level hierarchy: repository → directory → file → module → symbol → feature → packet → chunk. All IDs mirrored to Qdrant/Neo4j/Redis.';

COMMENT ON COLUMN atlas_packets.repository_id IS 'UUID: Code repository identifier';
COMMENT ON COLUMN atlas_packets.directory_id IS 'UUID: Directory/module path identifier';
COMMENT ON COLUMN atlas_packets.file_id IS 'UUID: Source file identifier';
COMMENT ON COLUMN atlas_packets.module_id IS 'UUID: Module/component identifier';
COMMENT ON COLUMN atlas_packets.symbol_id IS 'UUID: Function/class/symbol identifier';
COMMENT ON COLUMN atlas_packets.feature_id_new IS 'STRING: Domain:feature-name (e.g., auth:session-validation)';
COMMENT ON COLUMN atlas_packets.chunk_id IS 'UUID: Chunk in codebase_chunk_index';
