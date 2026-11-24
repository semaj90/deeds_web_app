-- Remaining PG18 exact-duplicate indexes (non-constraint-backed)
-- KEEP [agent_observations]: idx_agent_observations_hnsw (16 kB) | DUP: idx_agent_observations_hnsw_768 (16 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_agent_observations_hnsw_768;
-- KEEP [atlas_packet_features]: idx_ast_packet_key (4832 kB) | DUP: idx_atlas_packet_features_packet_key (4840 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packet_features_packet_key;
-- KEEP [atlas_projection_outbox]: atlas_projection_outbox_aggregate_idx (16 kB) | DUP: idx_atlas_projection_outbox_aggregate (16 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_projection_outbox_aggregate;
-- KEEP [atlas_summary_layers]: idx_summary_layers_packet_key (1072 kB) | DUP: idx_atlas_summary_layers_packet_key (1024 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_summary_layers_packet_key;
-- KEEP [cluster_cards]: cluster_cards_centroid_dim (64 kB) | DUP: cluster_cards_centroid_dim_idx (64 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.cluster_cards_centroid_dim_idx;
-- KEEP [cluster_summaries]: cluster_summaries_tags_gin (16 kB) | DUP: idx_cluster_summaries_tags_gin (16 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_cluster_summaries_tags_gin;
-- KEEP [code_features]: idx_code_features_page_rank (104 kB) | DUP: idx_code_features_page_rank_score (104 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_code_features_page_rank_score;
-- KEEP [feature_packet_bindings]: feature_packet_bindings_source_idx (8192 bytes) | DUP: feature_packet_bindings_source_ref_idx (8192 bytes)
DROP INDEX CONCURRENTLY IF EXISTS public.feature_packet_bindings_source_ref_idx;
-- KEEP [feature_packet_bindings]: feature_packet_bindings_packet_idx (8192 bytes) | DUP: feature_packet_bindings_packet_key_idx (8192 bytes)
DROP INDEX CONCURRENTLY IF EXISTS public.feature_packet_bindings_packet_key_idx;
-- KEEP [graph_communities]: graph_communities_pkey (52 MB) | DUP: graph_communities_unique_idx (52 MB)
DROP INDEX CONCURRENTLY IF EXISTS public.graph_communities_unique_idx;
-- KEEP [graphify_files]: graphify_files_code_source_revision_idx_v2 (3560 kB) | DUP: graphify_files_code_source_revision_compat_v1 (3560 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.graphify_files_code_source_revision_compat_v1;
-- KEEP [nes_chrom_packets]: nes_chrom_packets_metadata_gin (1808 kB) | DUP: idx_nes_chrom_packets_metadata_gin (1808 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_nes_chrom_packets_metadata_gin;
-- KEEP [nes_chrom_packets]: idx_nes_chrom_packets_source_ref (168 kB) | DUP: nes_chrom_packets_source_ref_idx (168 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_source_ref_idx;
-- KEEP [nes_chrom_packets]: idx_nes_chrom_packets_source_ref (168 kB) | DUP: idx_nes_chrom_packets_source_ref_idx (168 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_nes_chrom_packets_source_ref_idx;
-- KEEP [nes_chrom_packets]: idx_nes_chrom_packets_feature_id (152 kB) | DUP: nes_chrom_packets_feature_id_idx (152 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_feature_id_idx;
-- KEEP [nes_chrom_packets]: idx_nes_chrom_packets_feature_id (152 kB) | DUP: idx_nes_chrom_packets_feature_id_idx (152 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_nes_chrom_packets_feature_id_idx;
-- KEEP [nes_chrom_packets]: idx_nes_chrom_packets_kmeans_cluster_idx (32 kB) | DUP: nes_chrom_packets_kmeans_cluster_idx (32 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.nes_chrom_packets_kmeans_cluster_idx;
-- KEEP [nes_chrom_packets]: nes_chrom_packets_lane_ids_gin (32 kB) | DUP: idx_nes_chrom_packets_lane_ids_gin (32 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_nes_chrom_packets_lane_ids_gin;
-- KEEP [nes_chrom_packets]: nes_chrom_packets_som_index_idx (32 kB) | DUP: idx_nes_chrom_packets_som_index_idx (32 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_nes_chrom_packets_som_index_idx;
-- KEEP [nes_chrom_packets]: nes_chrom_packets_feature_ids_gin (32 kB) | DUP: idx_nes_chrom_packets_feature_ids_gin (32 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_nes_chrom_packets_feature_ids_gin;
-- KEEP [nes_chrom_packets]: nes_chrom_packets_tags_gin (32 kB) | DUP: idx_nes_chrom_packets_tags_gin (32 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_nes_chrom_packets_tags_gin;
-- KEEP [rag_query_log]: rag_query_log_hash_idx (16 kB) | DUP: rag_query_log_query_hash_idx (16 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.rag_query_log_query_hash_idx;
-- KEEP [route_runtime_packets]: idx_route_runtime_packets_source_ref (16 kB) | DUP: idx_route_runtime_packets_source_ref_idx (16 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_route_runtime_packets_source_ref_idx;
-- KEEP [task_semantic_packets]: idx_task_semantic_packets_metadata (24 kB) | DUP: idx_task_semantic_packets_metadata_gin (24 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_task_semantic_packets_metadata_gin;
-- KEEP [task_semantic_packets]: idx_task_semantic_packets_packet_key (16 kB) | DUP: idx_task_semantic_packets_packet_key_idx (16 kB)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_task_semantic_packets_packet_key_idx;
