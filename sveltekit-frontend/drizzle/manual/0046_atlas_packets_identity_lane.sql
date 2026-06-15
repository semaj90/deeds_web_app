-- Phase 16-H: Add identity_lane + Qdrant linkage fields to atlas_packets
-- identity_lane values: qdrant_chunk | mcp_tool_stub | tree_node | glyph_record | neo4j_node | redis_hot_key
-- MCP tool stubs keep packet_key/source_ref but have NULL qdrant_* fields (identity_confidence = 0.75)

ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS identity_lane       text DEFAULT 'qdrant_chunk',
  ADD COLUMN IF NOT EXISTS qdrant_point_id     text,
  ADD COLUMN IF NOT EXISTS qdrant_collection   text,
  ADD COLUMN IF NOT EXISTS qdrant_vector_dim   integer,
  ADD COLUMN IF NOT EXISTS identity_confidence double precision DEFAULT 1.0;

CREATE INDEX IF NOT EXISTS idx_atlas_packets_identity_lane
  ON atlas_packets (identity_lane);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_qdrant_point_id
  ON atlas_packets (qdrant_point_id);

-- Backfill: rows that already have a qdrant_point_id in metadata stay as qdrant_chunk
-- MCP tool stubs (source_ref like '%#%' = tool stub ref) get mcp_tool_stub lane
UPDATE atlas_packets
SET identity_lane = 'mcp_tool_stub',
    identity_confidence = 0.75
WHERE source_ref LIKE '%#%'
  AND identity_lane = 'qdrant_chunk';
