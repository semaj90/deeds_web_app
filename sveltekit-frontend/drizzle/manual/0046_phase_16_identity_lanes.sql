-- Phase 16-H: Identity Lanes for atlas_higher_hop_index
-- Adds normalized identity columns for cross-system bridges
--
-- Design: Multiple identity lanes (packet_key, source_ref_key, qdrant, tree, glyph, neo4j, redis)
-- instead of a single magic join key. Each lane is independent and can be populated separately.

ALTER TABLE atlas_higher_hop_index
  ADD COLUMN IF NOT EXISTS source_ref_key text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS chunk_id text,
  ADD COLUMN IF NOT EXISTS identity_confidence numeric DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS identity_lane text,
  ADD COLUMN IF NOT EXISTS qdrant_payload_key text,
  ADD COLUMN IF NOT EXISTS qdrant_vector_dim integer DEFAULT 768;

-- Add column comments
COMMENT ON COLUMN atlas_higher_hop_index.source_ref_key IS 'Normalized source_ref for cross-system matching (removes prefixes, normalizes slashes)';
COMMENT ON COLUMN atlas_higher_hop_index.content_hash IS 'SHA256 hash of chunk content for deduplication';
COMMENT ON COLUMN atlas_higher_hop_index.chunk_id IS 'Qdrant chunk_id payload field for content-level identity';
COMMENT ON COLUMN atlas_higher_hop_index.identity_confidence IS 'Confidence in identity linking (0.0-1.0)';
COMMENT ON COLUMN atlas_higher_hop_index.identity_lane IS 'Which lane established the identity: packet_key | source_ref | qdrant | tree | glyph | neo4j | redis';
COMMENT ON COLUMN atlas_higher_hop_index.qdrant_payload_key IS 'Qdrant payload key used for matching (source_ref/sourceRef/packet_key)';
COMMENT ON COLUMN atlas_higher_hop_index.qdrant_vector_dim IS 'Vector dimensionality from Qdrant collection';

-- Create GIN index on source_ref_key for prefix matching
CREATE INDEX IF NOT EXISTS idx_higher_hop_source_ref_key ON atlas_higher_hop_index (source_ref_key);

-- Create composite index for identity lookups
CREATE INDEX IF NOT EXISTS idx_higher_hop_identity_lane_confidence
  ON atlas_higher_hop_index (identity_lane, identity_confidence DESC);

-- Create index for Qdrant collection + point ID lookups
CREATE INDEX IF NOT EXISTS idx_higher_hop_qdrant_collection_point
  ON atlas_higher_hop_index (qdrant_collection, qdrant_point_id);

-- Backfill source_ref_key from existing source_ref (normalize it)
UPDATE atlas_higher_hop_index
SET source_ref_key =
  TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(source_ref, '^sveltekit-frontend/', ''),
        '^\.?/', ''),
      '\\', '/', 'g'),
    ' '
  ),
  identity_lane = 'source_ref',
  identity_confidence = 0.95
WHERE source_ref_key IS NULL AND source_ref IS NOT NULL;

-- Update lineage_version to 2 to mark this as v2 identity contract
UPDATE atlas_higher_hop_index
SET lineage_version = 2
WHERE lineage_version = 1;

-- Add comment to metadata tracking this migration
UPDATE atlas_higher_hop_index
SET metadata = jsonb_set(
  metadata,
  '{identity_lanes_v2}',
  to_jsonb(NOW())
)
WHERE metadata->>'identity_lanes_v2' IS NULL;
