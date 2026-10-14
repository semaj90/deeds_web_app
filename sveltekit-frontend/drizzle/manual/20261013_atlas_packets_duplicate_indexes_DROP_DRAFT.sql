-- DRAFT — NOT APPLIED. For review only.
-- Purpose: drop exact-duplicate btree/gin indexes on atlas_packets. Each group has an identical
-- definition (name removed) and no unique or constraint backing. The index kept per group is the
-- one with more scans (2026-10-13 pg_stat_user_indexes); the dropped one is archived in
-- .tmp/atlas-packets-duplicate-indexes-manifest.json (definitions + sha256) before this runs.
-- Expected effect: no change to query results; less write amplification and disk use.
-- Rehearsal form below uses transactional DROP INDEX (rolled back). For apply, run the
-- CONCURRENTLY form (no table lock), one statement at a time, outside a transaction.

BEGIN;

DROP INDEX IF EXISTS idx_atlas_packets_metadata_gin;
DROP INDEX IF EXISTS idx_atlas_packets_community_id_idx;
DROP INDEX IF EXISTS idx_atlas_packets_domain_class_idx;
DROP INDEX IF EXISTS idx_atlas_packets_feature_id_idx;
DROP INDEX IF EXISTS idx_atlas_packets_packet_key;
DROP INDEX IF EXISTS idx_atlas_packets_payload_path;
DROP INDEX IF EXISTS idx_atlas_packets_som_index_idx;
DROP INDEX IF EXISTS idx_atlas_packets_source_ref_idx;
DROP INDEX IF EXISTS idx_atlas_packets_tags_gin;
DROP INDEX IF EXISTS idx_atlas_packets_source_feature;

COMMIT;

-- Apply form (no table lock; run statements one by one, outside a transaction):
--   DROP INDEX CONCURRENTLY IF EXISTS idx_atlas_packets_metadata_gin;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_atlas_packets_community_id_idx;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_atlas_packets_domain_class_idx;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_atlas_packets_feature_id_idx;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_atlas_packets_packet_key;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_atlas_packets_payload_path;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_atlas_packets_som_index_idx;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_atlas_packets_source_ref_idx;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_atlas_packets_tags_gin;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_atlas_packets_source_feature;

-- Rollback (owner decision only): recreate each dropped index from its archived definition.
