-- Phase 108E: Schema Alignment
-- Adds identity and lineage columns to atlas_packets to match SemanticPacketV1 contract

-- 1. Add missing identity columns (non-destructive, with defaults)
ALTER TABLE IF EXISTS atlas_packets
ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(256) NOT NULL DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS semantic_anchor VARCHAR(512) NOT NULL DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS tree_node_id VARCHAR(256),
ADD COLUMN IF NOT EXISTS ontology_version VARCHAR(64),
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- 2. Backfill workspace_id from directory_path (extraction)
UPDATE atlas_packets
SET workspace_id = COALESCE(NULLIF(directory_path, ''), 'unknown')
WHERE workspace_id = 'unknown' AND directory_path IS NOT NULL;

-- 3. Backfill semantic_anchor from feature_label or feature_id
UPDATE atlas_packets
SET semantic_anchor = COALESCE(NULLIF(feature_label, ''), NULLIF(feature_id, ''), 'unknown')
WHERE semantic_anchor = 'unknown';

-- 4. Backfill ontology_version to 'v1.0' (canonical default)
UPDATE atlas_packets
SET ontology_version = 'v1.0'
WHERE ontology_version IS NULL;

-- 5. Extract content_hash from payload JSONB if present
UPDATE atlas_packets
SET content_hash = payload ->> 'content_hash'
WHERE content_hash IS NULL AND payload IS NOT NULL AND (payload ->> 'content_hash') IS NOT NULL;

-- 6. Add indexes for immutability gates and lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_identity
ON atlas_packets (packet_key, workspace_id, source_ref, feature_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_semantic_anchor
ON atlas_packets (semantic_anchor);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_tree_node_id
ON atlas_packets (tree_node_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_content_hash
ON atlas_packets (content_hash);

-- 7. Verify migration success
-- This is a comment showing the verification query to run separately:
-- SELECT COUNT(*) total,
--        SUM(CASE WHEN workspace_id IS NOT NULL THEN 1 ELSE 0 END) has_workspace,
--        SUM(CASE WHEN semantic_anchor IS NOT NULL THEN 1 ELSE 0 END) has_anchor,
--        SUM(CASE WHEN ontology_version IS NOT NULL THEN 1 ELSE 0 END) has_ontology
-- FROM atlas_packets;
