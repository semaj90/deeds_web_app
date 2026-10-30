-- Query-plan probe (EXPLAIN only, no ANALYZE). Run before and after; after, the chosen index must be a KEEPER.
-- STATE: PREPARED_NOT_APPLIED (2026-10-29). Generated from the live pg_index catalog; PostgreSQL 18, db legal_ai_db.
-- V2 supersedes V1 (20261029_duplicate_index_consolidation_v1.sql, unmodified) and the 2026-10-13 DROP_DRAFT (scan-count keepers).
-- Keeper rule: constraint/PK > name used by repo scripts (they CREATE IF NOT EXISTS or verify by name) > declared in the active Drizzle schema > declared only in drizzle/schema.ts (introspection snapshot) > name. idx_scan is NOT used (stats_reset unknown).

EXPLAIN (COSTS OFF) SELECT 1 FROM atlas_packets WHERE packet_key = 'packet:7adb63a91858';
EXPLAIN (COSTS OFF) SELECT 1 FROM atlas_packets WHERE source_ref = 'docker/image-synthesis/app.py';
EXPLAIN (COSTS OFF) SELECT 1 FROM atlas_packets WHERE feature_id = 'docker.app';
EXPLAIN (COSTS OFF) SELECT 1 FROM atlas_packets WHERE community_id = 1;
EXPLAIN (COSTS OFF) SELECT 1 FROM atlas_packets WHERE tags @> ARRAY['x']::text[];
EXPLAIN (COSTS OFF) SELECT 1 FROM atlas_packets WHERE metadata @> '{"a":1}'::jsonb;
EXPLAIN (COSTS OFF) SELECT 1 FROM codebase_chunk_index WHERE metadata @> '{"a":1}'::jsonb;
EXPLAIN (COSTS OFF) SELECT 1 FROM nes_chrom_packets WHERE source_ref = 'x';
EXPLAIN (COSTS OFF) SELECT 1 FROM nes_chrom_packets WHERE feature_id = 'x';
EXPLAIN (COSTS OFF) SELECT 1 FROM task_semantic_packets WHERE packet_key = 'x';
