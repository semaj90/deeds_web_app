# Postgres Contract Mirrors Report

Generated: 2026-06-14T01:31:58.397Z

## Summary

- tables checked: 6
- static aligned: 6
- live aligned: 6
- live unavailable: 0
- blockers: 0

## Packet Spine

- canonical spine: packet_key / source_ref / feature_id / community_id
- packet contract lane is read-only
- live DB unavailability is a warning, not a crash

## task_semantic_packets

- classification: LIVE_DB_ALIGNED
- repair_class: null
- static: SQL_AND_DRIZZLE_ALIGNED
- live: LIVE_DB_ALIGNED
- schema sources: sveltekit-frontend/src/lib/server/db/schema/tasks.ts
- manual sources: sveltekit-frontend/drizzle/manual/20260601_add_alias_and_parent_atlas_indexes.sql, sveltekit-frontend/drizzle/manual/20260601_task_semantic_packets_alias_id_and_atlas_profile_gin.sql, sveltekit-frontend/drizzle/manual/20260601_task_semantic_packets_v2.sql, sveltekit-frontend/drizzle/manual/20260606_task_semantic_packets_live_alignment.sql, sveltekit-frontend/drizzle/manual/9999_create_task_semantic_packets.sql
- static columns: agent_pickup_ready, alias_id, canonical_source_ref, centroid_id, cluster_id, confidence, created_at, deleted, feature_id, file_path, id, next_action, observed_at, parent_centroid_id, point_kind, qdrant_point_id, related_feature_ids, related_file_paths, related_task_ids, semantic_path, source_ref, source_ref_hash, status, summary_hash, summary_llm, summary_model, updated_at, valid_from, valid_to, workspace_id, workspace_task_id
- static indexes: idx_task_semantic_packets_agent_pickup_ready, idx_task_semantic_packets_centroid_id, idx_task_semantic_packets_cluster_id, idx_task_semantic_packets_created_at, idx_task_semantic_packets_feature_id, idx_task_semantic_packets_point_kind, idx_task_semantic_packets_qdrant_point_id, idx_task_semantic_packets_related_feature_ids_gin, idx_task_semantic_packets_related_file_paths_gin, idx_task_semantic_packets_related_task_ids_gin, idx_task_semantic_packets_semantic_path_gin, idx_task_semantic_packets_source_ref, idx_task_semantic_packets_status, idx_task_semantic_packets_updated_at, idx_task_semantic_packets_workspace_id, idx_task_semantic_packets_workspace_task_id, task_semantic_packets_alias_id_idx, tsp_source_ref_hash_idx
- live columns: id, qdrant_point_id, workspace_task_id, feature_id, summary_model, summary_hash, confidence, status, agent_pickup_ready, created_at, updated_at, deleted, alias_id, point_kind, workspace_id, source_ref, file_path, semantic_path, related_feature_ids, related_task_ids, related_file_paths, cluster_id, centroid_id, parent_centroid_id, summary_llm, next_action, observed_at, valid_from, valid_to, source_ref_hash, canonical_source_ref
- live indexes: idx_task_semantic_packets_agent_pickup_ready, idx_task_semantic_packets_centroid_id, idx_task_semantic_packets_cluster_id, idx_task_semantic_packets_created_at, idx_task_semantic_packets_feature_id, idx_task_semantic_packets_point_kind, idx_task_semantic_packets_qdrant_point_id, idx_task_semantic_packets_related_feature_ids_gin, idx_task_semantic_packets_related_file_paths_gin, idx_task_semantic_packets_related_task_ids_gin, idx_task_semantic_packets_semantic_path_gin, idx_task_semantic_packets_source_ref, idx_task_semantic_packets_status, idx_task_semantic_packets_updated_at, idx_task_semantic_packets_workspace_id, idx_task_semantic_packets_workspace_task_id, task_semantic_packets_alias_id_idx, task_semantic_packets_pkey, tsp_source_ref_hash_idx
- live rows: 314

## atlas_packets

- classification: LIVE_DB_ALIGNED
- repair_class: null
- static: SQL_AND_DRIZZLE_ALIGNED
- live: LIVE_DB_ALIGNED
- schema sources: sveltekit-frontend/src/lib/server/db/schema/atlas-packets.ts
- manual sources: sveltekit-frontend/drizzle/manual/20260611_atlas_packets_schema.sql, sveltekit-frontend/drizzle/manual/20260612_packet_payload_expression_indexes.sql
- static columns: artifact_id, byte_end, byte_start, cluster_id, community_confidence, community_id, community_source, concept_ids, created_at, embedding, feature_id, metadata, packet_id, packet_key, payload, reward_prior, sha256, source_kind, source_path, source_ref, source_ref_key, summary, updated_at
- static indexes: atlas_packets_feature_idx, atlas_packets_identity_idx, atlas_packets_metadata_gin_idx, atlas_packets_metadata_hash_idx, atlas_packets_metadata_path_idx, atlas_packets_payload_gin, atlas_packets_payload_hash_idx, idx_atlas_packets_community_id, idx_atlas_packets_concept_ids, idx_atlas_packets_feature_id, idx_atlas_packets_packet_key, idx_atlas_packets_payload_file_url, idx_atlas_packets_payload_path, idx_atlas_packets_source_kind, idx_atlas_packets_source_ref, idx_atlas_packets_source_ref_key, idx_atlas_packets_summary_fts, idx_packet_payload_feature, idx_packet_payload_path
- live columns: packet_id, artifact_id, source_ref, feature_id, community_id, concept_ids, cluster_id, embedding, payload, summary, byte_start, byte_end, sha256, created_at, packet_key, source_kind, reward_prior, source_path, updated_at, source_ref_key, community_source, community_confidence, metadata
- live indexes: atlas_packets_feature_idx, atlas_packets_identity_idx, atlas_packets_metadata_gin_idx, atlas_packets_metadata_hash_idx, atlas_packets_metadata_path_idx, atlas_packets_payload_gin, atlas_packets_payload_hash_idx, atlas_packets_pkey, idx_atlas_packets_community_id, idx_atlas_packets_concept_ids, idx_atlas_packets_feature_id, idx_atlas_packets_packet_key, idx_atlas_packets_payload_file_url, idx_atlas_packets_payload_path, idx_atlas_packets_source_kind, idx_atlas_packets_source_ref, idx_atlas_packets_source_ref_key, idx_atlas_packets_summary_fts, idx_packet_payload_feature, idx_packet_payload_path
- live rows: 17476

## nes_chrom_packets

- classification: LIVE_DB_ALIGNED
- repair_class: null
- static: SQL_AND_DRIZZLE_ALIGNED
- live: LIVE_DB_ALIGNED
- schema sources: sveltekit-frontend/src/lib/server/db/schema/nes-chrom-packets.ts
- manual sources: sveltekit-frontend/drizzle/manual/20260601_nes_chrom_packets_and_kag_dag_hits.sql, sveltekit-frontend/drizzle/manual/20260606_nes_chrom_live_alignment.sql, sveltekit-frontend/drizzle/manual/atlas_dict_tables.sql
- static columns: chunk_id, confidence_score, created_at, embedding, feature_code, feature_id, feature_ids, id, kag_dag_run_id, kag_node_key, lane, lane_ids, model, packet_key, packet_type, packet_zstd, payload, qdrant_point_id, query_hash, som_cluster, som_code, source_ref, source_ref_id, source_refs, summary, token_budget, updated_at
- static indexes: idx_nes_chrom_packets_feature_ids_gin, idx_nes_chrom_packets_lane_ids_gin, idx_nes_chrom_packets_som_cluster, nes_chrom_packets_chunk_id_idx, nes_chrom_packets_embedding_hnsw, nes_chrom_packets_feature_code_idx, nes_chrom_packets_feature_id_idx, nes_chrom_packets_kag_run_idx, nes_chrom_packets_norm_source_ref_trgm_idx, nes_chrom_packets_packet_key_key, nes_chrom_packets_payload_gin, nes_chrom_packets_qdrant_point_idx, nes_chrom_packets_query_hash_idx, nes_chrom_packets_som_code_idx, nes_chrom_packets_source_ref_id_idx, nes_chrom_packets_source_ref_idx, nes_chrom_packets_source_ref_trgm_idx, nes_chrom_packets_source_refs_gin, nes_chrom_packets_summary_trgm_idx
- live columns: id, packet_key, query_hash, chunk_id, source_ref, source_refs, feature_id, packet_type, lane, model, summary, payload, embedding, qdrant_point_id, kag_dag_run_id, kag_node_key, token_budget, created_at, updated_at, feature_ids, som_cluster, lane_ids, source_ref_id, feature_code, som_code, confidence_score, packet_zstd
- live indexes: idx_nes_chrom_packets_feature_ids_gin, idx_nes_chrom_packets_lane_ids_gin, idx_nes_chrom_packets_som_cluster, nes_chrom_packets_chunk_id_idx, nes_chrom_packets_embedding_hnsw, nes_chrom_packets_feature_code_idx, nes_chrom_packets_feature_id_idx, nes_chrom_packets_kag_run_idx, nes_chrom_packets_norm_source_ref_trgm_idx, nes_chrom_packets_packet_key_key, nes_chrom_packets_payload_gin, nes_chrom_packets_pkey, nes_chrom_packets_qdrant_point_idx, nes_chrom_packets_query_hash_idx, nes_chrom_packets_som_code_idx, nes_chrom_packets_source_ref_id_idx, nes_chrom_packets_source_ref_idx, nes_chrom_packets_source_ref_trgm_idx, nes_chrom_packets_source_refs_gin, nes_chrom_packets_summary_trgm_idx
- live rows: 14911

## nes_chrom_kag_dag_hits

- classification: LIVE_DB_ALIGNED
- repair_class: null
- static: SQL_AND_DRIZZLE_ALIGNED
- live: LIVE_DB_ALIGNED
- schema sources: sveltekit-frontend/src/lib/server/db/schema/nes-chrom-packets.ts
- manual sources: sveltekit-frontend/drizzle/manual/20260601_nes_chrom_packets_and_kag_dag_hits.sql, sveltekit-frontend/drizzle/manual/20260606_nes_chrom_live_alignment.sql
- static columns: chunk_id, created_at, evidence, hit_type, id, metadata, node_key, packet_id, run_id, score, source_ref
- static indexes: nes_chrom_kag_dag_hits_chunk_idx, nes_chrom_kag_dag_hits_evidence_gin, nes_chrom_kag_dag_hits_metadata_gin, nes_chrom_kag_dag_hits_node_key_idx, nes_chrom_kag_dag_hits_packet_idx, nes_chrom_kag_dag_hits_run_idx, nes_chrom_kag_dag_hits_source_ref_idx
- live columns: id, packet_id, run_id, chunk_id, source_ref, hit_type, score, node_key, evidence, created_at, metadata
- live indexes: nes_chrom_kag_dag_hits_chunk_idx, nes_chrom_kag_dag_hits_evidence_gin, nes_chrom_kag_dag_hits_metadata_gin, nes_chrom_kag_dag_hits_node_key_idx, nes_chrom_kag_dag_hits_packet_idx, nes_chrom_kag_dag_hits_pkey, nes_chrom_kag_dag_hits_run_idx, nes_chrom_kag_dag_hits_source_ref_idx
- live rows: 32

## parent_atlas_documents

- classification: LIVE_DB_ALIGNED
- repair_class: null
- static: SQL_AND_DRIZZLE_ALIGNED
- live: LIVE_DB_ALIGNED
- schema sources: sveltekit-frontend/src/lib/server/db/schema/parent-atlas-documents.ts
- manual sources: sveltekit-frontend/drizzle/manual/20260601_add_alias_and_parent_atlas_indexes.sql
- static columns: alias_id, centroid_id, cluster_id, created_at, drizzle_refs, exports, feature_id, file_ext, has_auth, has_zod, id, imports, index_lane, ingest_source, is_route, is_svelte_comp, line_count, payload, profile_card_visible, qdrant_point_id, rel_path, related_feature_ids, route_handlers, source_kind, source_ref, source_ref_id, summary, summary_lod0, summary_lod1, summary_lod2, tags, updated_at, workspace_id
- static indexes: idx_pad_alias_id, idx_pad_cluster_id, idx_pad_feature_id, idx_pad_index_lane, idx_pad_lod1, idx_pad_payload_gin, idx_pad_qdrant_point_id, idx_pad_source_kind, idx_pad_source_ref, idx_pad_source_ref_id, idx_pad_tags_gin, idx_pad_workspace_id, idx_parent_atlas_documents_related_feature_ids_gin, parent_atlas_documents_source_ref_workspace_uq
- live columns: id, source_ref, feature_id, workspace_id, rel_path, file_ext, tags, summary, line_count, is_route, is_svelte_comp, has_auth, has_zod, drizzle_refs, imports, exports, route_handlers, payload, cluster_id, centroid_id, qdrant_point_id, alias_id, ingest_source, created_at, updated_at, related_feature_ids, source_kind, profile_card_visible, index_lane, summary_lod0, summary_lod1, summary_lod2, source_ref_id
- live indexes: idx_pad_alias_id, idx_pad_cluster_id, idx_pad_feature_id, idx_pad_index_lane, idx_pad_lod1, idx_pad_payload_gin, idx_pad_qdrant_point_id, idx_pad_source_kind, idx_pad_source_ref, idx_pad_source_ref_id, idx_pad_tags_gin, idx_pad_workspace_id, idx_parent_atlas_documents_related_feature_ids_gin, parent_atlas_documents_pkey, parent_atlas_documents_source_ref_workspace_uq
- live rows: 5395

## route_runtime_packets

- classification: LIVE_DB_ALIGNED
- repair_class: null
- static: SQL_AND_DRIZZLE_ALIGNED
- live: LIVE_DB_ALIGNED
- schema sources: sveltekit-frontend/src/lib/server/db/schema/route_runtime_packets.ts
- manual sources: sveltekit-frontend/drizzle/manual/20260603_atlas_synthesis_tables.sql, sveltekit-frontend/drizzle/manual/20260606_route_packet_tables.sql
- static columns: cache_hit, cache_tier, captured_at, cluster_id, feature_id, feature_ids, git_diff_rank, git_sha, id, lane_ids, latency_ms, packet_uuid, packet_version, prompt_hash, qdrant_hits, query_hash, query_preview, raw, redis_hot_keys, repair_method, repair_reason, response_tokens, reward, route, route_state, session_id, som_cluster, source_ref_quality, source_refs, superseded_by, supersedes_packet_uuid, user_id
- static indexes: idx_route_runtime_packets_feature_id, idx_route_runtime_packets_feature_ids_gin, idx_route_runtime_packets_raw_gin, idx_route_runtime_packets_source_refs_gin, idx_rrp_captured_at, idx_rrp_cluster_id, idx_rrp_feature_ids_gin, idx_rrp_git_sha, idx_rrp_packet_version, idx_rrp_route, idx_rrp_source_ref_quality, idx_rrp_source_refs_gin, idx_rrp_superseded_by, rrp_feature_idx, rrp_packet_uuid_uidx, rrp_raw_gin, rrp_state_idx
- live columns: id, captured_at, route, query_hash, query_preview, source_refs, feature_ids, lane_ids, cluster_id, som_cluster, qdrant_hits, redis_hot_keys, latency_ms, cache_hit, cache_tier, user_id, session_id, response_tokens, raw, prompt_hash, reward, route_state, packet_uuid, feature_id, packet_version, supersedes_packet_uuid, superseded_by, git_sha, git_diff_rank, source_ref_quality, repair_reason, repair_method
- live indexes: idx_route_runtime_packets_feature_id, idx_route_runtime_packets_feature_ids_gin, idx_route_runtime_packets_raw_gin, idx_route_runtime_packets_source_refs_gin, idx_rrp_captured_at, idx_rrp_cluster_id, idx_rrp_feature_ids_gin, idx_rrp_git_sha, idx_rrp_packet_version, idx_rrp_route, idx_rrp_source_ref_quality, idx_rrp_source_refs_gin, idx_rrp_superseded_by, route_runtime_packets_pkey, rrp_feature_idx, rrp_packet_uuid_uidx, rrp_raw_gin, rrp_state_idx
- live rows: 1
