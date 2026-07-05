# Postgres Contract Mirrors Report

Generated: 2026-07-04T18:24:32.526Z

## Summary

- tables checked: 6
- static aligned: 4
- live aligned: 0
- live unavailable: 0
- blockers: 8

## Packet Spine

- canonical spine: packet_key / source_ref / feature_id / community_id
- packet contract lane is read-only
- live DB unavailability is a warning, not a crash

## task_semantic_packets

- classification: COLUMN_MISMATCH
- repair_class: APPLY_EXISTING_SQL
- static: SQL_AND_DRIZZLE_ALIGNED
- live: COLUMN_MISMATCH
- schema sources: sveltekit-frontend/src/lib/server/db/schema/tasks.ts
- manual sources: sveltekit-frontend/drizzle/manual/0024_feature_id_metadata_gin_indexes.sql, sveltekit-frontend/drizzle/manual/20260601_add_alias_and_parent_atlas_indexes.sql, sveltekit-frontend/drizzle/manual/20260601_task_semantic_packets_alias_id_and_atlas_profile_gin.sql, sveltekit-frontend/drizzle/manual/20260601_task_semantic_packets_v2.sql, sveltekit-frontend/drizzle/manual/20260606_task_semantic_packets_live_alignment.sql, sveltekit-frontend/drizzle/manual/9999_create_task_semantic_packets.sql
- static columns: agent_pickup_ready, alias_id, canonical, canonical_source_ref, centroid_id, cluster_id, community_confidence, community_id, community_source, confidence, created_at, deleted, domain_class, feature_id, feature_label, file_path, id, kmeans_cluster, ledger_type, lineage_version, metadata, next_action, observed_at, packet_key, parent_centroid_id, payload_backfilled_at, point_kind, qdrant_point_id, related_feature_ids, related_file_paths, related_task_ids, semantic_path, som_col, som_index, som_row, source_ref, source_ref_hash, status, summary, summary_hash, summary_llm, summary_model, tags, updated_at, valid_from, valid_to, workspace_id, workspace_task_id
- static indexes: idx_task_semantic_packets_agent_pickup_ready, idx_task_semantic_packets_centroid_id, idx_task_semantic_packets_cluster_id, idx_task_semantic_packets_community_confidence_idx, idx_task_semantic_packets_community_id_idx, idx_task_semantic_packets_community_source_idx, idx_task_semantic_packets_created_at, idx_task_semantic_packets_domain_class_idx, idx_task_semantic_packets_feature_id, idx_task_semantic_packets_feature_id_idx, idx_task_semantic_packets_feature_label_idx, idx_task_semantic_packets_kmeans_cluster_idx, idx_task_semantic_packets_ledger_type_idx, idx_task_semantic_packets_lineage_version_idx, idx_task_semantic_packets_metadata_gin, idx_task_semantic_packets_packet_key_idx, idx_task_semantic_packets_point_kind, idx_task_semantic_packets_qdrant_point_id, idx_task_semantic_packets_related_feature_ids_gin, idx_task_semantic_packets_related_file_paths_gin, idx_task_semantic_packets_related_task_ids_gin, idx_task_semantic_packets_semantic_path_gin, idx_task_semantic_packets_som_col_idx, idx_task_semantic_packets_som_index_idx, idx_task_semantic_packets_som_row_idx, idx_task_semantic_packets_source_ref, idx_task_semantic_packets_source_ref_idx, idx_task_semantic_packets_status, idx_task_semantic_packets_tags_gin, idx_task_semantic_packets_updated_at, idx_task_semantic_packets_workspace_id, idx_task_semantic_packets_workspace_task_id, task_semantic_packets_alias_id_idx, tsp_source_ref_hash_idx
- live columns: none
- live indexes: none
- live rows: n/a

## atlas_packets

- classification: COLUMN_MISMATCH
- repair_class: NEEDS_REVIEW
- static: COLUMN_MISMATCH
- live: COLUMN_MISMATCH
- schema sources: sveltekit-frontend/src/lib/server/db/schema/atlas-packets.ts
- manual sources: sveltekit-frontend/drizzle/manual/0024_feature_id_metadata_gin_indexes.sql, sveltekit-frontend/drizzle/manual/0035_phase_20_packet_metadata_topology.sql, sveltekit-frontend/drizzle/manual/0040_tree_nodes_pageindex.sql, sveltekit-frontend/drizzle/manual/0045_adaptive_schema_repair.generated.sql, sveltekit-frontend/drizzle/manual/0046_atlas_packets_identity_lane.sql, sveltekit-frontend/drizzle/manual/0047_bm25_packet_summary_index.sql, sveltekit-frontend/drizzle/manual/20260611_atlas_packets_schema.sql, sveltekit-frontend/drizzle/manual/20260612_packet_payload_expression_indexes.sql, sveltekit-frontend/drizzle/manual/phase-b-enrichment-schema.sql
- static columns: artifact_id, betweenness, bm25_indexed_at, bm25_score, bm25_terms, byte_end, byte_start, canonical, canonical_source_ref, cluster_id, community_confidence, community_id, community_source, concept_ids, created_at, directory_path, domain_class, eigenvector, embedding, error_pattern, extracted_entities, feature_group_id, feature_id, feature_label, file_path, function_symbol, identity_confidence, identity_lane, keywords, kmeans_cluster, latent_64, ledger_type, lineage_version, metadata, neo4j_node_id, packet_id, packet_key, packet_ulid, pagerank, payload, payload_backfilled_at, permissions, qdrant_collection, qdrant_point_id, qdrant_vector_dim, redis_centroid_key, reward_prior, sha256, som_col, som_index, som_row, source_kind, source_path, source_ref, source_ref_key, summary, tags, taxonomy_level, title_id, topology, tree_node_id, updated_at, vectors
- static indexes: atlas_packets_feature_idx, atlas_packets_identity_idx, atlas_packets_metadata_gin_idx, atlas_packets_metadata_hash_idx, atlas_packets_metadata_path_idx, atlas_packets_payload_gin, atlas_packets_payload_hash_idx, idx_atlas_packets_betweenness, idx_atlas_packets_bm25_indexed_at, idx_atlas_packets_bm25_terms, idx_atlas_packets_canonical_source_ref, idx_atlas_packets_cluster_id, idx_atlas_packets_community_confidence, idx_atlas_packets_community_id, idx_atlas_packets_concept_ids, idx_atlas_packets_created_at, idx_atlas_packets_directory_feature, idx_atlas_packets_directory_path, idx_atlas_packets_domain_class, idx_atlas_packets_eigenvector, idx_atlas_packets_error_pattern, idx_atlas_packets_extracted_entities, idx_atlas_packets_feature_group_id, idx_atlas_packets_feature_id, idx_atlas_packets_feature_id_composite, idx_atlas_packets_feature_summary, idx_atlas_packets_identity, idx_atlas_packets_identity_lane, idx_atlas_packets_keywords, idx_atlas_packets_metadata_domain, idx_atlas_packets_metadata_feature_id, idx_atlas_packets_metadata_gin, idx_atlas_packets_metadata_som, idx_atlas_packets_neo4j_node_id, idx_atlas_packets_packet_key, idx_atlas_packets_packet_ulid, idx_atlas_packets_pagerank, idx_atlas_packets_payload_domain_class, idx_atlas_packets_payload_feature_label, idx_atlas_packets_payload_file_url, idx_atlas_packets_payload_gin, idx_atlas_packets_payload_path, idx_atlas_packets_permissions_gin, idx_atlas_packets_qdrant_point_id, idx_atlas_packets_redis_centroid_key, idx_atlas_packets_reward_prior, idx_atlas_packets_source_feature, idx_atlas_packets_source_kind, idx_atlas_packets_source_ref, idx_atlas_packets_source_ref_key, idx_atlas_packets_summary_fts, idx_atlas_packets_summary_trgm, idx_atlas_packets_taxonomy_level, idx_atlas_packets_title_id, idx_atlas_packets_title_trgm, idx_atlas_packets_topology_gin, idx_atlas_packets_tree_node_id, idx_atlas_packets_updated_at, idx_atlas_packets_vectors_gin, idx_packet_payload_feature, idx_packet_payload_path, idx_packets_agentic_grouping, idx_packets_centroid_cache, idx_packets_community_feature, idx_packets_export_alignment, idx_packets_feature_count, idx_packets_qdrant_prefilter, idx_packets_som_feature_grouping, idx_packets_source_feature_multi_hop
- live columns: packet_id, artifact_id, packet_key, source_ref, source_ref_key, file_path, directory_path, feature_id, feature_label, community_id, concept_ids, cluster_id, embedding, payload, metadata, permissions, topology, vectors, summary, tags, byte_start, byte_end, sha256, source_kind, source_path, group_id, packet_universe, qdrant_point_id, qdrant_collection, qdrant_vector_dim, identity_lane, identity_confidence, som_cluster, som_row, som_col, som_index, kmeans_cluster, pagerank, betweenness, eigenvector, neo4j_node_id, redis_centroid_key, latent_64, reward_prior, created_at, updated_at, function_symbol, content_embedding_384, embedding_status, embedding_timestamp, extracted_entities, keywords, error_pattern, feature_group_id, domain_class, taxonomy_level, bm25_indexed_at, bm25_score, bm25_terms, packet_ulid, title_id, canonical_source_ref, page_rank_score, kmeans_cluster_id, tree_node_id, routing_hints
- live indexes: atlas_packets_packet_key_key, atlas_packets_pkey, idx_atlas_packets_bm25_indexed_at, idx_atlas_packets_bm25_terms, idx_atlas_packets_canonical_source_ref, idx_atlas_packets_community_id, idx_atlas_packets_concept_ids, idx_atlas_packets_domain_class, idx_atlas_packets_embedding_status, idx_atlas_packets_envelope_fts, idx_atlas_packets_error_pattern, idx_atlas_packets_extracted_entities, idx_atlas_packets_feature_group_id, idx_atlas_packets_feature_id, idx_atlas_packets_file_path, idx_atlas_packets_file_path_trgm, idx_atlas_packets_identity_lane, idx_atlas_packets_keywords, idx_atlas_packets_kmeans_cluster_id, idx_atlas_packets_metadata_gin, idx_atlas_packets_metadata_gin_pathops, idx_atlas_packets_neo4j_node_id, idx_atlas_packets_packet_key, idx_atlas_packets_packet_ulid, idx_atlas_packets_page_rank_score, idx_atlas_packets_payload_gin, idx_atlas_packets_payload_gin_pathops, idx_atlas_packets_permissions_gin_pathops, idx_atlas_packets_qdrant_point_id, idx_atlas_packets_redis_centroid_key, idx_atlas_packets_routing_hints, idx_atlas_packets_som_cluster, idx_atlas_packets_som_index, idx_atlas_packets_source_feature, idx_atlas_packets_source_kind, idx_atlas_packets_source_ref, idx_atlas_packets_source_ref_key, idx_atlas_packets_summary_fts, idx_atlas_packets_tags, idx_atlas_packets_taxonomy_level, idx_atlas_packets_title_id, idx_atlas_packets_topology_gin_pathops, idx_atlas_packets_tree_node_id, idx_atlas_packets_vectors_gin_pathops
- live rows: 58304

## nes_chrom_packets

- classification: COLUMN_MISMATCH
- repair_class: APPLY_EXISTING_SQL
- static: COLUMN_MISMATCH
- live: COLUMN_MISMATCH
- schema sources: sveltekit-frontend/src/lib/server/db/schema/nes-chrom-packets.ts
- manual sources: sveltekit-frontend/drizzle/manual/0035_phase_20_packet_metadata_topology.sql, sveltekit-frontend/drizzle/manual/20260601_nes_chrom_packets_and_kag_dag_hits.sql, sveltekit-frontend/drizzle/manual/20260606_nes_chrom_live_alignment.sql, sveltekit-frontend/drizzle/manual/atlas_dict_tables.sql
- static columns: betweenness, canonical, chunk_id, community_confidence, community_id, community_source, confidence_score, created_at, domain_class, eigenvector, embedding, feature_code, feature_id, feature_ids, feature_label, file_path, id, identity_lane, kag_dag_run_id, kag_node_key, kmeans_cluster, lane, lane_ids, ledger_type, lineage_version, metadata, model, neo4j_node_id, packet_key, packet_type, packet_zstd, pagerank, payload, payload_backfilled_at, permissions, qdrant_point_id, query_hash, redis_centroid_key, som_cluster, som_code, som_col, som_index, som_row, source_ref, source_ref_id, source_refs, summary, tags, token_budget, topology, updated_at, vectors
- static indexes: idx_nes_chrom_packets_betweenness, idx_nes_chrom_packets_community_confidence_idx, idx_nes_chrom_packets_community_id_idx, idx_nes_chrom_packets_community_source_idx, idx_nes_chrom_packets_domain_class_idx, idx_nes_chrom_packets_eigenvector, idx_nes_chrom_packets_feature_id, idx_nes_chrom_packets_feature_id_idx, idx_nes_chrom_packets_feature_ids_gin, idx_nes_chrom_packets_feature_label_idx, idx_nes_chrom_packets_feature_source, idx_nes_chrom_packets_kmeans_cluster_idx, idx_nes_chrom_packets_lane_ids_gin, idx_nes_chrom_packets_ledger_type_idx, idx_nes_chrom_packets_lineage_version_idx, idx_nes_chrom_packets_metadata_gin, idx_nes_chrom_packets_neo4j_node_id, idx_nes_chrom_packets_packet_key_idx, idx_nes_chrom_packets_pagerank, idx_nes_chrom_packets_permissions_gin, idx_nes_chrom_packets_redis_centroid_key, idx_nes_chrom_packets_som_cluster, idx_nes_chrom_packets_som_index_idx, idx_nes_chrom_packets_source_ref, idx_nes_chrom_packets_source_ref_idx, idx_nes_chrom_packets_tags_gin, idx_nes_chrom_packets_topology_gin, idx_nes_chrom_packets_vectors_gin, nes_chrom_packets_chunk_id_idx, nes_chrom_packets_confidence_score_idx, nes_chrom_packets_embedding_hnsw, nes_chrom_packets_feature_code_idx, nes_chrom_packets_feature_id_idx, nes_chrom_packets_kag_run_idx, nes_chrom_packets_norm_source_ref_trgm_idx, nes_chrom_packets_packet_key_key, nes_chrom_packets_packet_zstd_idx, nes_chrom_packets_payload_gin, nes_chrom_packets_qdrant_point_idx, nes_chrom_packets_query_hash_idx, nes_chrom_packets_som_code_idx, nes_chrom_packets_source_ref_id_idx, nes_chrom_packets_source_ref_idx, nes_chrom_packets_source_ref_trgm_idx, nes_chrom_packets_source_refs_gin, nes_chrom_packets_summary_trgm_idx
- live columns: none
- live indexes: none
- live rows: n/a

## nes_chrom_kag_dag_hits

- classification: COLUMN_MISMATCH
- repair_class: APPLY_EXISTING_SQL
- static: SQL_AND_DRIZZLE_ALIGNED
- live: COLUMN_MISMATCH
- schema sources: sveltekit-frontend/src/lib/server/db/schema/nes-chrom-packets.ts
- manual sources: sveltekit-frontend/drizzle/manual/20260601_nes_chrom_packets_and_kag_dag_hits.sql, sveltekit-frontend/drizzle/manual/20260606_nes_chrom_live_alignment.sql
- static columns: chunk_id, created_at, evidence, hit_type, id, metadata, node_key, packet_id, run_id, score, source_ref
- static indexes: nes_chrom_kag_dag_hits_chunk_idx, nes_chrom_kag_dag_hits_evidence_gin, nes_chrom_kag_dag_hits_metadata_gin, nes_chrom_kag_dag_hits_node_key_idx, nes_chrom_kag_dag_hits_packet_idx, nes_chrom_kag_dag_hits_run_idx, nes_chrom_kag_dag_hits_source_ref_idx
- live columns: none
- live indexes: none
- live rows: n/a

## parent_atlas_documents

- classification: COLUMN_MISMATCH
- repair_class: APPLY_EXISTING_SQL
- static: SQL_AND_DRIZZLE_ALIGNED
- live: COLUMN_MISMATCH
- schema sources: sveltekit-frontend/src/lib/server/db/schema/parent-atlas-documents.ts
- manual sources: sveltekit-frontend/drizzle/manual/20260601_add_alias_and_parent_atlas_indexes.sql
- static columns: alias_id, centroid_id, cluster_id, created_at, drizzle_refs, exports, feature_id, file_ext, has_auth, has_zod, id, imports, index_lane, ingest_source, is_route, is_svelte_comp, line_count, payload, profile_card_visible, qdrant_point_id, rel_path, related_feature_ids, route_handlers, source_kind, source_ref, source_ref_id, summary, summary_lod0, summary_lod1, summary_lod2, tags, tree_node_id, updated_at, workspace_id
- static indexes: idx_pad_alias_id, idx_pad_cluster_id, idx_pad_feature_id, idx_pad_index_lane, idx_pad_lod1, idx_pad_payload_gin, idx_pad_qdrant_point_id, idx_pad_source_kind, idx_pad_source_ref, idx_pad_source_ref_id, idx_pad_tags_gin, idx_pad_tree_node_id, idx_pad_workspace_id, idx_parent_atlas_documents_related_feature_ids_gin, parent_atlas_documents_source_ref_workspace_uq
- live columns: none
- live indexes: none
- live rows: n/a

## route_runtime_packets

- classification: COLUMN_MISMATCH
- repair_class: APPLY_EXISTING_SQL
- static: SQL_AND_DRIZZLE_ALIGNED
- live: COLUMN_MISMATCH
- schema sources: sveltekit-frontend/src/lib/server/db/schema/route_runtime_packets.ts
- manual sources: sveltekit-frontend/drizzle/manual/0024_feature_id_metadata_gin_indexes.sql, sveltekit-frontend/drizzle/manual/20260603_atlas_synthesis_tables.sql, sveltekit-frontend/drizzle/manual/20260606_route_packet_tables.sql
- static columns: cache_hit, cache_tier, canonical, captured_at, cluster_id, community_confidence, community_id, community_source, domain_class, feature_id, feature_ids, feature_label, git_diff_rank, git_sha, id, kmeans_cluster, lane_ids, latency_ms, ledger_type, lineage_version, metadata, packet_key, packet_uuid, packet_version, payload_backfilled_at, prompt_hash, qdrant_hits, query_hash, query_preview, raw, redis_hot_keys, repair_method, repair_reason, response_tokens, reward, route, route_state, session_id, som_cluster, som_col, som_index, som_row, source_ref, source_ref_quality, source_refs, summary, superseded_by, supersedes_packet_uuid, tags, tree_node_id, user_id
- static indexes: idx_route_runtime_packets_community_confidence_idx, idx_route_runtime_packets_community_id_idx, idx_route_runtime_packets_community_source_idx, idx_route_runtime_packets_domain_class_idx, idx_route_runtime_packets_feature_id, idx_route_runtime_packets_feature_id_idx, idx_route_runtime_packets_feature_ids_gin, idx_route_runtime_packets_feature_label_idx, idx_route_runtime_packets_kmeans_cluster_idx, idx_route_runtime_packets_ledger_type_idx, idx_route_runtime_packets_lineage_version_idx, idx_route_runtime_packets_metadata_gin, idx_route_runtime_packets_packet_key_idx, idx_route_runtime_packets_raw_gin, idx_route_runtime_packets_som_col_idx, idx_route_runtime_packets_som_index_idx, idx_route_runtime_packets_som_row_idx, idx_route_runtime_packets_source_ref, idx_route_runtime_packets_source_ref_idx, idx_route_runtime_packets_source_refs_gin, idx_route_runtime_packets_tags_gin, idx_route_runtime_packets_tree_node_id, idx_rrp_captured_at, idx_rrp_cluster_id, idx_rrp_feature_cluster, idx_rrp_feature_ids_gin, idx_rrp_git_sha, idx_rrp_packet_version, idx_rrp_raw_domain, idx_rrp_raw_feature_id, idx_rrp_raw_gin, idx_rrp_route, idx_rrp_source_ref_quality, idx_rrp_source_refs_gin, idx_rrp_superseded_by, rrp_feature_idx, rrp_packet_uuid_uidx, rrp_raw_gin, rrp_state_idx
- live columns: none
- live indexes: none
- live rows: n/a

## Blockers

- task_semantic_packets: live COLUMN_MISMATCH
- atlas_packets: static COLUMN_MISMATCH
- atlas_packets: live COLUMN_MISMATCH
- nes_chrom_packets: static COLUMN_MISMATCH
- nes_chrom_packets: live COLUMN_MISMATCH
- nes_chrom_kag_dag_hits: live COLUMN_MISMATCH
- parent_atlas_documents: live COLUMN_MISMATCH
- route_runtime_packets: live COLUMN_MISMATCH
