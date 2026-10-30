-- Rollback / recreation SQL (original definitions) for G0-G2
-- STATE: PREPARED_NOT_APPLIED (2026-10-29). Generated from the live pg_index catalog; PostgreSQL 18, db legal_ai_db.
-- V2 supersedes V1 (20261029_duplicate_index_consolidation_v1.sql, unmodified) and the 2026-10-13 DROP_DRAFT (scan-count keepers).
-- Keeper rule: constraint/PK > name used by repo scripts (they CREATE IF NOT EXISTS or verify by name) > declared in the active Drizzle schema > declared only in drizzle/schema.ts (introspection snapshot) > name. idx_scan is NOT used (stats_reset unknown).
-- Outside a transaction, one at a time. Only if a dropped index is later found necessary.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_projection_outbox_aggregate ON public.atlas_projection_outbox USING btree (aggregate_type, aggregate_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS graphify_files_code_source_revision_idx_v2 ON public.graphify_files USING btree (code_source_revision) WHERE (code_source_revision IS NOT NULL);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packet_features_packet_key ON public.atlas_packet_features USING btree (packet_key);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_source_ref_idx ON public.atlas_packets USING btree (source_ref);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_domain_class_idx ON public.atlas_packets USING btree (domain_class);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_tags_gin ON public.atlas_packets USING gin (tags);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_community_id_idx ON public.atlas_packets USING btree (community_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_packet_key_idx ON public.atlas_packets USING btree (packet_key);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_som_index_idx ON public.atlas_packets USING btree (som_index);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_feature_id_idx ON public.atlas_packets USING btree (feature_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_summary_layers_packet_key ON public.atlas_summary_layers USING btree (packet_key);
CREATE INDEX CONCURRENTLY IF NOT EXISTS cluster_cards_centroid_dim_idx ON public.cluster_cards USING btree (centroid_dim);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cluster_summaries_tags_gin ON public.cluster_summaries USING gin (tags);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_code_features_page_rank_score ON public.code_features USING btree (page_rank_score DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_semantic_tags_gin ON public.codebase_chunk_index USING gin (semantic_tags);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_metadata_gin ON public.codebase_chunk_index USING gin (metadata jsonb_path_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS feature_packet_bindings_source_ref_idx ON public.feature_packet_bindings USING btree (source_ref);
CREATE INDEX CONCURRENTLY IF NOT EXISTS feature_packet_bindings_packet_idx ON public.feature_packet_bindings USING btree (packet_key);
CREATE INDEX CONCURRENTLY IF NOT EXISTS rag_query_log_query_hash_idx ON public.rag_query_log USING btree (query_hash);
CREATE INDEX CONCURRENTLY IF NOT EXISTS nes_chrom_packets_feature_ids_gin ON public.nes_chrom_packets USING gin (feature_ids);
CREATE INDEX CONCURRENTLY IF NOT EXISTS nes_chrom_packets_metadata_gin ON public.nes_chrom_packets USING gin (metadata);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nes_chrom_packets_feature_id_idx ON public.nes_chrom_packets USING btree (feature_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS nes_chrom_packets_feature_id_idx ON public.nes_chrom_packets USING btree (feature_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS nes_chrom_packets_lane_ids_gin ON public.nes_chrom_packets USING gin (lane_ids);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nes_chrom_packets_source_ref_idx ON public.nes_chrom_packets USING btree (source_ref);
CREATE INDEX CONCURRENTLY IF NOT EXISTS nes_chrom_packets_source_ref_idx ON public.nes_chrom_packets USING btree (source_ref);
CREATE INDEX CONCURRENTLY IF NOT EXISTS nes_chrom_packets_tags_gin ON public.nes_chrom_packets USING gin (tags);
CREATE INDEX CONCURRENTLY IF NOT EXISTS nes_chrom_packets_kmeans_cluster_idx ON public.nes_chrom_packets USING btree (kmeans_cluster);
CREATE INDEX CONCURRENTLY IF NOT EXISTS nes_chrom_packets_som_index_idx ON public.nes_chrom_packets USING btree (som_index);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_route_runtime_packets_source_ref_idx ON public.route_runtime_packets USING btree (source_ref);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_semantic_packets_metadata_gin ON public.task_semantic_packets USING gin (metadata);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_semantic_packets_packet_key_idx ON public.task_semantic_packets USING btree (packet_key);
