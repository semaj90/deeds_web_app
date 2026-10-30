-- Duplicate index consolidation v1 - ACTIVE set
-- STATE: PREPARED_NOT_APPLIED. Generated 2026-10-29 from live pg_index catalog (PostgreSQL 18, db legal_ai_db).
-- Supersedes (does not edit) drizzle/manual/20261013_atlas_packets_duplicate_indexes_DROP_DRAFT.sql, whose keeper choice used
-- scan counts; this file keeps the index that is catalog-identical and prefers constraint/schema ownership.
-- Run OUTSIDE a transaction, one statement at a time (DROP INDEX CONCURRENTLY cannot run in a transaction).
-- Preflight first: 20261029_duplicate_index_consolidation_v1_preflight.sql must return 0 rows of FAIL. Rollback: 20261029_duplicate_index_consolidation_v1_rollback.sql.
-- Lock: CONCURRENTLY takes SHARE UPDATE EXCLUSIVE on the table (reads/writes continue); needs a quiet window for waiting transactions.
-- Approval required before any statement here is executed.

-- atlas_projection_outbox: drop idx_atlas_projection_outbox_aggregate (keeps atlas_projection_outbox_aggregate_idx); ~0.0 MB
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_projection_outbox_aggregate;

-- graphify_files: drop graphify_files_code_source_revision_idx_v2 (keeps graphify_files_code_source_revision_compat_v1); ~3.5 MB
DROP INDEX CONCURRENTLY IF EXISTS public.graphify_files_code_source_revision_idx_v2;

-- ---------------------------------------------------------------------------------------------
-- PHASE 2 (NOT ACTIVE): schema-declared duplicates. Drizzle schema.ts declares BOTH members of each pair, so dropping
-- one in Postgres without removing its declaration lets drizzle-kit regenerate it. Do these only together with a
-- schema edit (remove the duplicate index() entry) in the same reviewed change.
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packet_features_packet_key;  -- atlas_packet_features (keeps idx_ast_packet_key) ~4.7 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_source_ref;  -- atlas_packets (keeps idx_atlas_packets_source_ref_idx) ~11.8 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_payload_path;  -- atlas_packets (keeps idx_atlas_packets_payload_gin_pathops) ~17.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_domain_class_idx;  -- atlas_packets (keeps idx_atlas_packets_domain_class) ~2.1 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_source_feature;  -- atlas_packets (keeps idx_packets_source_feature_multi_hop) ~16.1 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_tags_gin;  -- atlas_packets (keeps idx_atlas_packets_tags) ~3.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_metadata_gin;  -- atlas_packets (keeps atlas_packets_metadata_gin_idx) ~160.1 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_community_id_idx;  -- atlas_packets (keeps idx_atlas_packets_community_id) ~2.3 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_packet_key;  -- atlas_packets (keeps idx_atlas_packets_packet_key_idx) ~5.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_som_index_idx;  -- atlas_packets (keeps idx_atlas_packets_som_index) ~2.1 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_feature_id;  -- atlas_packets (keeps idx_atlas_packets_feature_id_idx) ~5.2 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_summary_layers_packet_key;  -- atlas_summary_layers (keeps idx_atlas_summary_layers_packet_key) ~1.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.cluster_cards_centroid_dim_idx;  -- cluster_cards (keeps cluster_cards_centroid_dim) ~0.1 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_cluster_summaries_tags_gin;  -- cluster_summaries (keeps cluster_summaries_tags_gin) ~0.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_code_features_page_rank_score;  -- code_features (keeps idx_code_features_page_rank) ~0.1 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_codebase_chunk_semantic_tags_gin;  -- codebase_chunk_index (keeps codebase_chunk_index_semantic_tags_gin) ~2.4 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_codebase_chunk_metadata_gin;  -- codebase_chunk_index (keeps codebase_chunk_index_metadata_gin) ~38.9 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.feature_packet_bindings_source_ref_idx;  -- feature_packet_bindings (keeps feature_packet_bindings_source_idx) ~0.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.feature_packet_bindings_packet_key_idx;  -- feature_packet_bindings (keeps feature_packet_bindings_packet_idx) ~0.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_feature_ids_gin;  -- nes_chrom_packets (keeps idx_nes_chrom_packets_feature_ids_gin) ~0.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_metadata_gin;  -- nes_chrom_packets (keeps idx_nes_chrom_packets_metadata_gin) ~1.8 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_nes_chrom_packets_feature_id_idx;  -- nes_chrom_packets (keeps idx_nes_chrom_packets_feature_id) ~0.1 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_feature_id_idx;  -- nes_chrom_packets (keeps idx_nes_chrom_packets_feature_id) ~0.1 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_lane_ids_gin;  -- nes_chrom_packets (keeps idx_nes_chrom_packets_lane_ids_gin) ~0.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_nes_chrom_packets_source_ref_idx;  -- nes_chrom_packets (keeps idx_nes_chrom_packets_source_ref) ~0.2 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_source_ref_idx;  -- nes_chrom_packets (keeps idx_nes_chrom_packets_source_ref) ~0.2 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_tags_gin;  -- nes_chrom_packets (keeps idx_nes_chrom_packets_tags_gin) ~0.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_kmeans_cluster_idx;  -- nes_chrom_packets (keeps idx_nes_chrom_packets_kmeans_cluster_idx) ~0.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_som_index_idx;  -- nes_chrom_packets (keeps idx_nes_chrom_packets_som_index_idx) ~0.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.rag_query_log_query_hash_idx;  -- rag_query_log (keeps rag_query_log_hash_idx) ~0.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_route_runtime_packets_source_ref_idx;  -- route_runtime_packets (keeps idx_route_runtime_packets_source_ref) ~0.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_task_semantic_packets_metadata_gin;  -- task_semantic_packets (keeps idx_task_semantic_packets_metadata) ~0.0 MB
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_task_semantic_packets_packet_key_idx;  -- task_semantic_packets (keeps idx_task_semantic_packets_packet_key) ~0.0 MB

-- REVIEW_REQUIRED / PROTECTED (never in this file): idx_agent_observations_hnsw_768 [PROTECTED]; graph_communities_unique_idx [REVIEW_REQUIRED]
