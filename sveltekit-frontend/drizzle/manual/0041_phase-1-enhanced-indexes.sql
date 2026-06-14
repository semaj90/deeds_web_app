-- Phase 1b: Enhanced Indexes for PostgreSQL 18 Adaptive Schema
--
-- Purpose: Add specialized indexes for optimal filtering/aggregation performance
--
-- Context:
-- - atlas_codebase_packets: 3,251 packets (baseline)
-- - Supports Phase 4B BM25 + concept + Qdrant hybrid retrieval
-- - Enables adaptive schema metadata querying via JSONB paths
--
-- Execution: idempotent, safe to re-run
-- Duration: <2s for index creation (non-blocking on 3K rows)

-- 1. BM25 full-text search on summary field (Phase 4B text signal)
-- Required for: concept extraction pipeline, keyword-based retrieval
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_packets_summary_fts
ON atlas_codebase_packets USING gin(to_tsvector('english', COALESCE(metadata->>'summary', '')))
WHERE metadata->>'summary' IS NOT NULL;

-- 2. JSONB partial GIN index for community_source and domain classification
-- Required for: adaptive schema queries on metadata nested paths
-- Optimized for: document-level filtering on (community_source, domain, embedding_model)
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_metadata_community_gin
ON atlas_codebase_packets USING gin(metadata jsonb_path_ops)
WHERE metadata->>'community_source' IS NOT NULL OR metadata->>'domain' IS NOT NULL;

-- 3. Partial index on high-confidence community assignments
-- Required for: filtering to trustworthy enrichment signals (>=0.65 threshold)
-- Gate: community_confidence >= 0.65 signals are load-bearing for Phase 4B
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_community_high_confidence
ON atlas_codebase_packets(community_id, community_confidence DESC)
WHERE community_confidence >= 0.65;

-- 4. BRIN index on created_at for temporal queries
-- Required for: incremental indexing (Phase 1c onwards), audit trail range scans
-- BRIN is 10× smaller than B-tree for monotonic time columns
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_created_at_brin
ON atlas_codebase_packets USING brin(created_at);

-- 5. Composite index on (feature_id, community_id) for two-factor grouping
-- Required for: Phase 4B layer C enrichment joins (feature + community filtering)
-- Enables: efficient GROUP BY feature_id, community_id aggregations
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_feature_community
ON atlas_codebase_packets(feature_id, community_id)
WHERE community_id IS NOT NULL;

-- 6. Sparse index on metadata->>'embedding_model' for versioning queries
-- Required for: tracking which embedding model created each chunk
-- Use case: when changing embedding models, find stale chunks for reindexing
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_embedding_model
ON atlas_codebase_packets((metadata->>'embedding_model'))
WHERE metadata->>'embedding_model' IS NOT NULL;

-- 7. Partial index on high-quality packets (for fast ANN prefiltering)
-- Required for: Qdrant ANN speed (pre-filter by quality before vector search)
-- Gate: lineage_version matches current schema + community_confidence >= 0.5
CREATE INDEX IF NOT EXISTS idx_atlas_codebase_quality_filter
ON atlas_codebase_packets(packet_key, feature_id)
WHERE lineage_version = 'packet-identity-v2' AND community_confidence >= 0.5;

-- Verification queries (run after apply):
-- SELECT COUNT(*) as total, COUNT(som_cluster) as som_filled FROM atlas_codebase_packets;
-- SELECT COUNT(*) as high_conf FROM atlas_codebase_packets WHERE community_confidence >= 0.65;
-- SELECT jsonb_object_keys(metadata) as field, COUNT(*) FROM atlas_codebase_packets GROUP BY field;
