-- Read-only preflight: verifies each pair is still catalog-identical and the keeper is valid
-- STATE: PREPARED_NOT_APPLIED. Generated 2026-10-29 from live pg_index catalog (PostgreSQL 18, db legal_ai_db).
-- Supersedes (does not edit) drizzle/manual/20261013_atlas_packets_duplicate_indexes_DROP_DRAFT.sql, whose keeper choice used
-- scan counts; this file keeps the index that is catalog-identical and prefers constraint/schema ownership.
-- Expect: every row status = 'PASS'. Any FAIL/MISSING means the plan is stale; do not run the migration.
WITH pairs(tbl, keep, drop_idx) AS (VALUES
  ('atlas_packet_features','idx_ast_packet_key','idx_atlas_packet_features_packet_key'),
  ('atlas_packets','idx_atlas_packets_source_ref_idx','idx_atlas_packets_source_ref'),
  ('atlas_packets','idx_atlas_packets_payload_gin_pathops','idx_atlas_packets_payload_path'),
  ('atlas_packets','idx_atlas_packets_domain_class','idx_atlas_packets_domain_class_idx'),
  ('atlas_packets','idx_packets_source_feature_multi_hop','idx_atlas_packets_source_feature'),
  ('atlas_packets','idx_atlas_packets_tags','idx_atlas_packets_tags_gin'),
  ('atlas_packets','atlas_packets_metadata_gin_idx','idx_atlas_packets_metadata_gin'),
  ('atlas_packets','idx_atlas_packets_community_id','idx_atlas_packets_community_id_idx'),
  ('atlas_packets','idx_atlas_packets_packet_key_idx','idx_atlas_packets_packet_key'),
  ('atlas_packets','idx_atlas_packets_som_index','idx_atlas_packets_som_index_idx'),
  ('atlas_packets','idx_atlas_packets_feature_id_idx','idx_atlas_packets_feature_id'),
  ('atlas_projection_outbox','atlas_projection_outbox_aggregate_idx','idx_atlas_projection_outbox_aggregate'),
  ('atlas_summary_layers','idx_atlas_summary_layers_packet_key','idx_summary_layers_packet_key'),
  ('cluster_cards','cluster_cards_centroid_dim','cluster_cards_centroid_dim_idx'),
  ('cluster_summaries','cluster_summaries_tags_gin','idx_cluster_summaries_tags_gin'),
  ('code_features','idx_code_features_page_rank','idx_code_features_page_rank_score'),
  ('codebase_chunk_index','codebase_chunk_index_semantic_tags_gin','idx_codebase_chunk_semantic_tags_gin'),
  ('codebase_chunk_index','codebase_chunk_index_metadata_gin','idx_codebase_chunk_metadata_gin'),
  ('feature_packet_bindings','feature_packet_bindings_source_idx','feature_packet_bindings_source_ref_idx'),
  ('feature_packet_bindings','feature_packet_bindings_packet_idx','feature_packet_bindings_packet_key_idx'),
  ('graph_communities','graph_communities_pkey','graph_communities_unique_idx'),
  ('graphify_files','graphify_files_code_source_revision_compat_v1','graphify_files_code_source_revision_idx_v2'),
  ('nes_chrom_packets','idx_nes_chrom_packets_feature_ids_gin','nes_chrom_packets_feature_ids_gin'),
  ('nes_chrom_packets','idx_nes_chrom_packets_metadata_gin','nes_chrom_packets_metadata_gin'),
  ('nes_chrom_packets','idx_nes_chrom_packets_feature_id','idx_nes_chrom_packets_feature_id_idx'),
  ('nes_chrom_packets','idx_nes_chrom_packets_feature_id','nes_chrom_packets_feature_id_idx'),
  ('nes_chrom_packets','idx_nes_chrom_packets_lane_ids_gin','nes_chrom_packets_lane_ids_gin'),
  ('nes_chrom_packets','idx_nes_chrom_packets_source_ref','idx_nes_chrom_packets_source_ref_idx'),
  ('nes_chrom_packets','idx_nes_chrom_packets_source_ref','nes_chrom_packets_source_ref_idx'),
  ('nes_chrom_packets','idx_nes_chrom_packets_tags_gin','nes_chrom_packets_tags_gin'),
  ('nes_chrom_packets','idx_nes_chrom_packets_kmeans_cluster_idx','nes_chrom_packets_kmeans_cluster_idx'),
  ('nes_chrom_packets','idx_nes_chrom_packets_som_index_idx','nes_chrom_packets_som_index_idx'),
  ('rag_query_log','rag_query_log_hash_idx','rag_query_log_query_hash_idx'),
  ('route_runtime_packets','idx_route_runtime_packets_source_ref','idx_route_runtime_packets_source_ref_idx'),
  ('task_semantic_packets','idx_task_semantic_packets_metadata','idx_task_semantic_packets_metadata_gin'),
  ('task_semantic_packets','idx_task_semantic_packets_packet_key','idx_task_semantic_packets_packet_key_idx')
), d AS (
  SELECT i.indexrelid, c.relname, i.indrelid, i.indkey::text k, i.indclass::text cl, i.indcollation::text co, i.indoption::text op,
         coalesce(pg_get_expr(i.indpred,i.indrelid),'') pred, coalesce(pg_get_expr(i.indexprs,i.indrelid),'') ex,
         coalesce(c.reloptions::text,'') ro, i.indisunique u, i.indnkeyatts nk, i.indnatts na, c.relam am, i.indisvalid v, i.indisready r
  FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
SELECT p.tbl, p.keep, p.drop_idx,
  CASE WHEN a.relname IS NULL OR b.relname IS NULL THEN 'MISSING'
       WHEN a.indrelid<>b.indrelid OR a.k<>b.k OR a.cl<>b.cl OR a.co<>b.co OR a.op<>b.op OR a.pred<>b.pred OR a.ex<>b.ex OR a.ro<>b.ro OR a.u<>b.u OR a.nk<>b.nk OR a.na<>b.na OR a.am<>b.am THEN 'FAIL_NOT_IDENTICAL'
       WHEN NOT a.v OR NOT a.r THEN 'FAIL_KEEPER_INVALID'
       WHEN EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid=b.indexrelid) THEN 'FAIL_DROP_BACKS_CONSTRAINT'
       WHEN EXISTS (SELECT 1 FROM pg_inherits h WHERE h.inhrelid=b.indexrelid) THEN 'FAIL_PARTITION_CHILD'
       ELSE 'PASS' END AS status
FROM pairs p LEFT JOIN d a ON a.relname=p.keep LEFT JOIN d b ON b.relname=p.drop_idx
ORDER BY status DESC, p.tbl;
