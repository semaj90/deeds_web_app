-- Duplicate index consolidation V2
-- STATE: PREPARED_NOT_APPLIED (2026-10-29). Generated from the live pg_index catalog; PostgreSQL 18, db legal_ai_db.
-- V2 supersedes V1 (20261029_duplicate_index_consolidation_v1.sql, unmodified) and the 2026-10-13 DROP_DRAFT (scan-count keepers).
-- Keeper rule: constraint/PK > name used by repo scripts (they CREATE IF NOT EXISTS or verify by name) > declared in the active Drizzle schema > declared only in drizzle/schema.ts (introspection snapshot) > name. idx_scan is NOT used (stats_reset unknown).
--
-- RUN POLICY (all approval-gated; nothing here is applied):
--   * Outside a transaction, ONE statement at a time (psql without -1/--single-transaction; no BEGIN). DROP INDEX CONCURRENTLY cannot run in a transaction block.
--   * Session: SET lock_timeout = '5s'; SET statement_timeout = 0; SET idle_in_transaction_session_timeout = '60s';
--     CONCURRENTLY waits for older transactions; if it times out or is cancelled it can leave the index INVALID (not dropped).
--     Re-running the same statement is safe (IF EXISTS). Find leftovers: SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
--   * Run 20261029_duplicate_index_consolidation_v2_preflight.sql first (every row PASS), then ONE group, then 20261029_duplicate_index_consolidation_v2_postcheck.sql, then 20261029_duplicate_index_consolidation_v2_plan_probe.sql and compare plans.
--   * Group G2 must ship in the SAME reviewed change as 20261029_duplicate_index_consolidation_v2_schema.patch (removes the dropped names' declarations from the active
--     Drizzle schema); otherwise drizzle-kit generate wants to re-create them. Never use drizzle-kit push on the live DB.
--   * For a manual psql runner only. The Drizzle migrate runner wraps statements in a transaction and would fail on CONCURRENTLY.
--   * Excluded on purpose: REVIEW_UNIQUE (graph_communities_unique_idx), REVIEW_SCRIPT_CONFLICT (3 indexes, see manifest blockers), PROTECTED (HNSW).

-- ===== G0 (already rehearsed in V1; identical statements) =====
-- [G0_V1_REHEARSED] atlas_projection_outbox: drop idx_atlas_projection_outbox_aggregate | keeps atlas_projection_outbox_aggregate_idx | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_projection_outbox_aggregate;

-- [G0_V1_REHEARSED] graphify_files: drop graphify_files_code_source_revision_idx_v2 | keeps graphify_files_code_source_revision_compat_v1 | ~3.5 MB
DROP INDEX CONCURRENTLY IF EXISTS public.graphify_files_code_source_revision_idx_v2;

-- ===== G1: no schema edit needed (drop target not declared in the active Drizzle schema) =====
-- [G1_NO_SCHEMA_EDIT] atlas_packet_features: drop idx_atlas_packet_features_packet_key | keeps idx_ast_packet_key | ~4.7 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packet_features_packet_key;

-- [G1_NO_SCHEMA_EDIT] atlas_packets: drop idx_atlas_packets_source_ref_idx | keeps idx_atlas_packets_source_ref | ~11.8 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_source_ref_idx;

-- [G1_NO_SCHEMA_EDIT] atlas_packets: drop idx_atlas_packets_domain_class_idx | keeps idx_atlas_packets_domain_class | ~2.1 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_domain_class_idx;

-- [G1_NO_SCHEMA_EDIT] atlas_packets: drop idx_atlas_packets_tags_gin | keeps idx_atlas_packets_tags | ~3.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_tags_gin;

-- [G1_NO_SCHEMA_EDIT] atlas_packets: drop idx_atlas_packets_community_id_idx | keeps idx_atlas_packets_community_id | ~2.3 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_community_id_idx;

-- [G1_NO_SCHEMA_EDIT] atlas_packets: drop idx_atlas_packets_packet_key_idx | keeps idx_atlas_packets_packet_key | ~5.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_packet_key_idx;

-- [G1_NO_SCHEMA_EDIT] atlas_packets: drop idx_atlas_packets_som_index_idx | keeps idx_atlas_packets_som_index | ~2.1 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_som_index_idx;

-- [G1_NO_SCHEMA_EDIT] atlas_packets: drop idx_atlas_packets_feature_id_idx | keeps idx_atlas_packets_feature_id | ~5.2 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_feature_id_idx;

-- [G1_NO_SCHEMA_EDIT] atlas_summary_layers: drop idx_summary_layers_packet_key | keeps idx_atlas_summary_layers_packet_key | ~1.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_summary_layers_packet_key;

-- [G1_NO_SCHEMA_EDIT] cluster_cards: drop cluster_cards_centroid_dim_idx | keeps cluster_cards_centroid_dim | ~0.1 MB
DROP INDEX CONCURRENTLY IF EXISTS public.cluster_cards_centroid_dim_idx;

-- [G1_NO_SCHEMA_EDIT] cluster_summaries: drop idx_cluster_summaries_tags_gin | keeps cluster_summaries_tags_gin | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_cluster_summaries_tags_gin;

-- [G1_NO_SCHEMA_EDIT] code_features: drop idx_code_features_page_rank_score | keeps idx_code_features_page_rank | ~0.1 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_code_features_page_rank_score;

-- [G1_NO_SCHEMA_EDIT] codebase_chunk_index: drop idx_codebase_chunk_semantic_tags_gin | keeps codebase_chunk_index_semantic_tags_gin | ~2.4 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_codebase_chunk_semantic_tags_gin;

-- [G1_NO_SCHEMA_EDIT] codebase_chunk_index: drop idx_codebase_chunk_metadata_gin | keeps codebase_chunk_index_metadata_gin | ~38.9 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_codebase_chunk_metadata_gin;

-- [G1_NO_SCHEMA_EDIT] feature_packet_bindings: drop feature_packet_bindings_source_ref_idx | keeps feature_packet_bindings_source_idx | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.feature_packet_bindings_source_ref_idx;

-- [G1_NO_SCHEMA_EDIT] feature_packet_bindings: drop feature_packet_bindings_packet_idx | keeps feature_packet_bindings_packet_key_idx | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.feature_packet_bindings_packet_idx;

-- [G1_NO_SCHEMA_EDIT] rag_query_log: drop rag_query_log_query_hash_idx | keeps rag_query_log_hash_idx | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.rag_query_log_query_hash_idx;

-- ===== G2: REQUIRES 20261029_duplicate_index_consolidation_v2_schema.patch in the same change =====
-- [G2_SCHEMA_EDIT] nes_chrom_packets: drop nes_chrom_packets_feature_ids_gin | keeps idx_nes_chrom_packets_feature_ids_gin | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_feature_ids_gin;

-- [G2_SCHEMA_EDIT] nes_chrom_packets: drop nes_chrom_packets_metadata_gin | keeps idx_nes_chrom_packets_metadata_gin | ~1.8 MB
DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_metadata_gin;

-- [G2_SCHEMA_EDIT] nes_chrom_packets: drop idx_nes_chrom_packets_feature_id_idx | keeps idx_nes_chrom_packets_feature_id | ~0.1 MB | 3-member group
DROP INDEX CONCURRENTLY IF EXISTS public.idx_nes_chrom_packets_feature_id_idx;

-- [G2_SCHEMA_EDIT] nes_chrom_packets: drop nes_chrom_packets_feature_id_idx | keeps idx_nes_chrom_packets_feature_id | ~0.1 MB | 3-member group
DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_feature_id_idx;

-- [G2_SCHEMA_EDIT] nes_chrom_packets: drop nes_chrom_packets_lane_ids_gin | keeps idx_nes_chrom_packets_lane_ids_gin | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_lane_ids_gin;

-- [G2_SCHEMA_EDIT] nes_chrom_packets: drop idx_nes_chrom_packets_source_ref_idx | keeps idx_nes_chrom_packets_source_ref | ~0.2 MB | 3-member group
DROP INDEX CONCURRENTLY IF EXISTS public.idx_nes_chrom_packets_source_ref_idx;

-- [G2_SCHEMA_EDIT] nes_chrom_packets: drop nes_chrom_packets_source_ref_idx | keeps idx_nes_chrom_packets_source_ref | ~0.2 MB | 3-member group
DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_source_ref_idx;

-- [G2_SCHEMA_EDIT] nes_chrom_packets: drop nes_chrom_packets_tags_gin | keeps idx_nes_chrom_packets_tags_gin | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_tags_gin;

-- [G2_SCHEMA_EDIT] nes_chrom_packets: drop nes_chrom_packets_kmeans_cluster_idx | keeps idx_nes_chrom_packets_kmeans_cluster_idx | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_kmeans_cluster_idx;

-- [G2_SCHEMA_EDIT] nes_chrom_packets: drop nes_chrom_packets_som_index_idx | keeps idx_nes_chrom_packets_som_index_idx | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_som_index_idx;

-- [G2_SCHEMA_EDIT] route_runtime_packets: drop idx_route_runtime_packets_source_ref_idx | keeps idx_route_runtime_packets_source_ref | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_route_runtime_packets_source_ref_idx;

-- [G2_SCHEMA_EDIT] task_semantic_packets: drop idx_task_semantic_packets_metadata_gin | keeps idx_task_semantic_packets_metadata | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_task_semantic_packets_metadata_gin;

-- [G2_SCHEMA_EDIT] task_semantic_packets: drop idx_task_semantic_packets_packet_key_idx | keeps idx_task_semantic_packets_packet_key | ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_task_semantic_packets_packet_key_idx;

