# Contextual Tree Readiness Audit

Generated: 2026-08-25T04:51:17.960Z

## Summary

- overall: SOURCE_UNAVAILABLE
- READY: 3
- FIELD_NAME_MISMATCH: 1
- SOURCE_UNAVAILABLE: 1
- DATA_ABSENT: 1

## Guardrails

- Neo4j builds traversal trees; KMeans/SOM/AE annotate those trees after join keys are proven.
- Qdrant remains the semantic lookup/filter engine; topology math remains external and is audited through payload/table signals.
- Louvain/PageRank are graph algorithms, not PCA/matmul lanes. This report only checks whether Neo4j graph truth is present.
- Cold-storage readiness is treated as provenance visibility here. Actual archive/move flows remain gated.
- Internal GEMM exists in simd-bridge/cpp/libtorch_graph_impl.cpp and simd-bridge/cpp/pytorch_graph_fp16.cc via torch::mm(); LibTorch GPU tensors dispatch torch::mm() through CUDA/cuBLAS where available.
- The remaining native bridge gap is no generic public matmul_f32 export. That is a public API warning, not a failure of the canonical 768→256→64 autoencoder lane.

## Join Lanes

- postgres
  - status: FIELD_NAME_MISMATCH
  - evidence: parent_atlas_documents:READY:61660 | route_runtime_packets:READY:7 | codebase_chunk_index:FIELD_NAME_MISMATCH:52417 | atlas_feature_map_synthesized:DATA_ABSENT:0 | atlas_feature_synthesis:DATA_ABSENT:0
  - actual field names: id, source_ref, rel_path, feature_id, line_count, is_route, is_svelte_comp, has_zod, drizzle_refs, imports, exports, qdrant_point_id, related_feature_ids, has_auth, route_handlers, tags, cluster_id, centroid_id, packet_key, feature_label, created_at, workspace_id, updated_at, captured_at, route, query_hash, query_preview, community_id, community_confidence, community_source, domain_class, ledger_type, lineage_version, metadata, canonical, payload_backfilled_at, som_row, som_col, som_index, kmeans_cluster, summary, source_refs, feature_ids, lane_ids, som_cluster, qdrant_hits, redis_hot_keys, latency_ms, cache_hit, cache_tier, user_id, session_id, response_tokens, raw, packet_version, source_ref_quality, qdrant_id, relative_path, symbol, kind, line_start, line_end, content_embedding, gpu_cluster, page_rank_score, neo4j_meta, indexed_at, enriched_at, content, cluster_summary, summary_embedding, signature_embedding, domain, language, extension, embedding_model, summary_model, semantic_tags, som_bmu_row, som_bmu_col, manifold4, chunk_id, repo_id, content_hash, token_count, neo4j_gpu_cluster, output_meta, content_embedding_384, summary_embedding_384, embedding_dimension, embedding_normalized, error_embedding, latent_64, latent64_model, latent64_meta, latent64_validated_at, latent64_msgpack, embedding_eligible, summary_hash, embedding_version, embedding_dtype, embedding_created_at, encoder_id, latent_embedding_valid, latent_embedding_validated_at, search_vector, ast_symbols, ast_imports, ast_exports, ast_facts_at, centroid_distance, second_cluster_id, second_distance, cluster_margin, kmeans_model_version, kmeans_assigned_at, kmeans_vector_contract, kmeans384_cluster, kmeans384_distance, kmeans384_second_id, kmeans384_second_dist, kmeans384_margin, kmeans384_model_version, kmeans384_assigned_at, kmeans_distance, content_embedding_768, reconstruction_error, routing_tier, tree_node_id, task_count, packet_count, ready_packet_count, last_packet_id, pickup_status, semantic_confidence, graph_distance, behavior_score, test_score, routing_score, runtime_state, last_verified_at, synthesized_at, atlas_file_count, qdrant_point_count, avg_confidence, max_confidence, primary_cluster_id, primary_centroid_id, cluster_ids, top_file_paths, synthesized_summary, next_actions, dominant_status, has_blocked, atlas_version
  - expected aliases present: feature_id, qdrant_point_id, source_ref, feature_ids, qdrant_hits, som_cluster, source_refs, avg_confidence, primary_cluster_id
  - expected aliases missing: summary, feature_id, qdrant_point_id, source_ref
- neo4j
  - status: READY
  - evidence: USED_CONCEPT:173163 | CALLS:59700 | BELONGS_TO_FEATURE:58843 | SIMILAR_TOPOLOGY:51333 | FROM_SOURCE:34408 | IMPLEMENTS_FEATURE:18936 | HAS_TREE_NODE:18811 | HAS_TITLE:18810 | CONTAINS:3917 | IMPORTS:3454 | BELONGS_TO_CLUSTER:1897 | TEST_COVERS_FILE:1572 | IN_COMMUNITY:1183 | USES_ENDPOINT:776 | USES_CACHE:674 | USES_DB:455 | USES_TOOL:390 | CONNECTS_TO:110 | HAS_METHOD:61 | FEATURE_ENRICHMENT:50 | HAS_TOPOLOGY:50 | HAS_ONTOLOGY:49 | IN_DOMAIN:49 | PRODUCED:47 | USED:26
  - actual field names: betweennessScore, communityId, community_id, filePath, graphAuthorityScore, graphPageRank, kcoreValue, leidenCommunity, louvainCommunity, pageRankScore, pagerank, updated_at, updated_at.day, updated_at.hour, updated_at.minute, updated_at.month, updated_at.nanosecond, updated_at.second, updated_at.timeZoneId, updated_at.timeZoneOffsetSeconds, updated_at.year
  - expected aliases present: filePath
  - expected aliases missing: featureId, feature_id, file_path, sourceRef, source_ref
- qdrant
  - status: SOURCE_UNAVAILABLE
  - evidence: actualFieldNames.some is not a function
  - actual field names: none
  - expected aliases present: none
  - expected aliases missing: none
- duckdb
  - status: READY
  - evidence: tables=vector_snapshot_packets_5k_768 | views=none | tables=vector_snapshot_packets | views=none | tables=cold_feature_rollups, cold_hot_path_rollups, cold_parent_atlas_cards, cold_profile_card_candidates, cold_source_ref_rollups | views=none | tables=card_enriched, cluster_summary, edges_all, lane_summary, node_degree, node_degree_agg, nodes_all, parent_atlas_full, sourceref_patch | views=none | tables=cards_raw, outcomes_raw, training_examples | views=atlas_cards_enriched, cluster_summary, parent_atlas_index
  - actual field names: embedding_digest, feature_id, legacy_domain, normalized_domain, packet_key, qdrant_vector_dim, representation_id, representation_revision, semantic_embedding_768, source_ref, summary, title_id, afm_indexed_at, alias_id, atlas_file_count, atlas_version, attention_score, avg_confidence, behavior_score, cache_hit, cache_tier, captured_at, centroid_id, cluster_id, cluster_ids, cold_storage_ready, created_at, dominant_status, drizzle_refs, exports, feature_avg_confidence, feature_behavior_score, feature_dominant_status, feature_ids, feature_primary_cluster, file_ext, file_path, has_auth, has_blocked, has_centroid, has_vector, has_zod, id, imports, ingest_source, is_route, is_svelte_comp, karpathy_blend, lane_ids, latency_ms, line_count, max_confidence, neo4j_node_id, nes_card_id, next_actions, packet_count, pad_centroid_count, pad_file_count, pad_qdrant_count, pagerank_score, primary_centroid_id, primary_cluster_id, qdrant_hits, qdrant_point_count, qdrant_point_id, rel_path, related_feature_ids, route, route_handlers, runtime_hot_path_score, semantic_confidence, som_cluster, source_id, source_kind, source_refs, synthesized_at, synthesized_summary, tags, top_file_paths, updated_at, workspace_id, atlas_id, avg_reward, card_count, card_id, cards_with_rewards, cluster_avg_reward, cluster_size, column0, degree, edge_type, feature, filePath, from_node_id, import_errors, lane, node_count, node_id, out_degree, payload_json, reward_avg, reward_count, som_col, som_index, som_row, sourceRef, title, to_node_id, total_degree, total_outcomes, unique_sources, weight, cardId, enrichment_phase, input, instruction, kind, output, reward, reward_total, som_bmu_col, som_bmu_distance, som_bmu_row, som_cluster_col, som_cluster_row, vector64_compressed, content, content_embedding_768, content_hash, domain, embedding_dim, kmeans_cluster, label, lexical_identifiers, lexical_imported_modules, lexical_keywords, lexical_symbols, normalized_domain_confidence, page_rank_score, relative_path, source_group, split_name, structural_calls, structural_exports, structural_imports, structural_path, structural_symbol_kind, structural_symbol_name, summary_hash, text, used_concepts, colocatedFiles, contentHash, directory, dynamicImports, dynamic_imports, extension, extensions, features, fileName, importErrorCount, indexed_at, keywords, lastScanned, lines, metadata, normalized_path, resolvedDynamicImports, resolvedStaticImports, rows, semanticMarkers, size, stableKey, staticImports, static_imports, bucket, bucket_rows, description, duckdb_rows, feature_key, file, joined_rows, line_number, packet_kind, path, pathmap_root, section, source, source_ref_joins, stable_id, stable_id_joins, status, task_id, todo_source_ref_rows, answer_hint, confidence, dst, fact_key, fact_type, fact_value, packet_id, packet_uuid, prompt_hash, query_hash, redis_hot_keys, reward_samples, route_state, score, scored_at, source_ref_count, src, token_hint, token_hints, labels, payload, score_authority, score_rank, score_recency, sourceRefs, term_type, term_value
  - expected aliases present: feature_id, source_ref, sourceRef
  - expected aliases missing: featureId, sourceRef, feature_id, source_ref
- couchdb
  - status: DATA_ABSENT
  - evidence: none
  - actual field names: none
  - expected aliases present: none
  - expected aliases missing: none
- packets
  - status: READY
  - evidence: tmpJsonlFiles=75 | tmpNdjsonFiles=75 | sourceRefHits=70784 | featureIdHits=0 | keySamples=file, calls, reasons, path, size, mtime, ext, sourceRef, edgeType, from, to, spec
  - actual field names: none
  - expected aliases present: none
  - expected aliases missing: none

## Packet Surfaces

- tmp JSONL files discovered: 75
- tmp NDJSON files discovered: 75
- source_ref hits in sampled JSONL files: 70784
- feature_id hits in sampled JSONL files: 0

## DuckDB Inventory

- .tmp/atlas-vector-snapshots/atlas-vector-snapshot-5k-768.duckdb
  - status: READY
  - tables: vector_snapshot_packets_5k_768
  - views: none
  - field names: embedding_digest, feature_id, legacy_domain, normalized_domain, packet_key, qdrant_vector_dim, representation_id, representation_revision, semantic_embedding_768, source_ref, summary, title_id
- .tmp/atlas-vector-snapshots/atlas-vector-index-lanes.duckdb
  - status: READY
  - tables: vector_snapshot_packets
  - views: none
  - field names: embedding_digest, feature_id, legacy_domain, normalized_domain, packet_key, qdrant_vector_dim, representation_id, representation_revision, semantic_embedding_768, source_ref, summary, title_id
- .tmp/offline-synthesis-mapreduce.duckdb
  - status: READY
  - tables: cold_feature_rollups, cold_hot_path_rollups, cold_parent_atlas_cards, cold_profile_card_candidates, cold_source_ref_rollups
  - views: none
  - field names: afm_indexed_at, alias_id, atlas_file_count, atlas_version, attention_score, avg_confidence, behavior_score, cache_hit, cache_tier, captured_at, centroid_id, cluster_id, cluster_ids, cold_storage_ready, created_at, dominant_status, drizzle_refs, exports, feature_avg_confidence, feature_behavior_score, feature_dominant_status, feature_id, feature_ids, feature_primary_cluster, file_ext, file_path, has_auth, has_blocked, has_centroid, has_vector, has_zod, id, imports, ingest_source, is_route, is_svelte_comp, karpathy_blend, lane_ids, latency_ms, line_count, max_confidence, neo4j_node_id, nes_card_id, next_actions, packet_count, pad_centroid_count, pad_file_count, pad_qdrant_count, pagerank_score, primary_centroid_id, primary_cluster_id, qdrant_hits, qdrant_point_count, qdrant_point_id, rel_path, related_feature_ids, route, route_handlers, runtime_hot_path_score, semantic_confidence, som_cluster, source_id, source_kind, source_ref, source_refs, synthesized_at, synthesized_summary, tags, top_file_paths, updated_at, workspace_id
- .tmp/ingest/atlas.duckdb
  - status: READY
  - tables: card_enriched, cluster_summary, edges_all, lane_summary, node_degree, node_degree_agg, nodes_all, parent_atlas_full, sourceref_patch
  - views: none
  - field names: atlas_id, avg_reward, card_count, card_id, cards_with_rewards, cluster_avg_reward, cluster_size, column0, degree, edge_type, feature, filePath, from_node_id, import_errors, lane, node_count, node_id, out_degree, payload_json, reward_avg, reward_count, som_col, som_index, som_row, sourceRef, title, to_node_id, total_degree, total_outcomes, unique_sources, weight
- duckdb/atlas.duckdb
  - status: READY
  - tables: cards_raw, outcomes_raw, training_examples
  - views: atlas_cards_enriched, cluster_summary, parent_atlas_index
  - field names: cardId, created_at, enrichment_phase, id, input, instruction, kind, output, reward, reward_avg, reward_count, reward_total, som_bmu_col, som_bmu_distance, som_bmu_row, som_cluster_col, som_cluster_row, sourceRef, vector64_compressed
- data/atlas-ml/atlas-analytics.duckdb
  - status: READY
  - tables: domain_training_rows, snapshot_packets, test_packets
  - views: none
  - field names: content, content_embedding_768, content_hash, domain, embedding_digest, embedding_dim, id, kmeans_cluster, label, legacy_domain, lexical_identifiers, lexical_imported_modules, lexical_keywords, lexical_symbols, normalized_domain, normalized_domain_confidence, packet_key, page_rank_score, qdrant_point_id, qdrant_vector_dim, relative_path, representation_id, representation_revision, som_cluster, source_group, source_ref, split_name, structural_calls, structural_exports, structural_imports, structural_path, structural_symbol_kind, structural_symbol_name, summary, summary_hash, text, used_concepts
- docs/reports/offline-synthesis-mapreduce.duckdb
  - status: READY
  - tables: atlas_feature_map, mapreduce_consolidated_index, mapreduce_consolidated_index_meta
  - views: none
  - field names: atlas_version, centroid_id, cluster_id, colocatedFiles, contentHash, directory, dynamicImports, dynamic_imports, extension, extensions, feature, feature_id, features, fileName, filePath, importErrorCount, indexed_at, keywords, lane_ids, lastScanned, lines, metadata, neo4j_node_id, nes_card_id, normalized_path, qdrant_point_id, related_feature_ids, resolvedDynamicImports, resolvedStaticImports, rows, semanticMarkers, size, som_cluster, source_id, source_ref, stableKey, staticImports, static_imports
- docs/reports/hidden-packet-pathmap.duckdb
  - status: READY
  - tables: hidden_packet_pathmap, hidden_packet_pathmap_summary
  - views: none
  - field names: bucket, bucket_rows, description, duckdb_rows, feature_id, feature_ids, feature_key, file, joined_rows, line_number, packet_kind, path, pathmap_root, section, source, source_ref, source_ref_joins, source_refs, stable_id, stable_id_joins, status, task_id, title, todo_source_ref_rows
- memory/packets/packets.duckdb
  - status: READY
  - tables: agg_facts, agg_rewards, agg_source_refs, agg_tokens, edges, facts, packets, raw_edges, raw_facts, raw_packets, raw_rewards, raw_token_map
  - views: none
  - field names: answer_hint, cache_hit, cache_tier, captured_at, confidence, created_at, dst, edge_type, fact_key, fact_type, fact_value, feature_id, feature_ids, id, lane_ids, latency_ms, metadata, packet_id, packet_uuid, prompt_hash, qdrant_hits, query_hash, redis_hot_keys, reward, reward_samples, route, route_state, score, scored_at, som_cluster, source_ref_count, source_refs, src, token_hint, token_hints, weight
- sveltekit-frontend/docs/reports/feature-card.duckdb
  - status: READY
  - tables: feature_card_terms, feature_cards
  - views: none
  - field names: card_id, id, kind, labels, payload, score_authority, score_rank, score_recency, sourceRefs, summary, term_type, term_value
- sveltekit-frontend/.tmp/duckdb/atlas.duckdb
  - status: READY
  - tables: cards_raw, outcomes_raw, training_examples
  - views: atlas_cards_enriched, cluster_summary, parent_atlas_index
  - field names: cardId, created_at, enrichment_phase, id, input, instruction, kind, output, reward, reward_avg, reward_count, reward_total, som_bmu_col, som_bmu_distance, som_bmu_row, som_cluster_col, som_cluster_row, sourceRef, vector64_compressed
- scripts/.tmp/atlas-vector-snapshots/atlas-vector-snapshot.duckdb
  - status: READY
  - tables: vector_snapshot_packets
  - views: none
  - field names: embedding_digest, feature_id, legacy_domain, normalized_domain, packet_key, qdrant_vector_dim, representation_id, representation_revision, semantic_embedding_768, source_ref, summary, title_id
- scripts/.tmp/atlas-vector-snapshots/atlas-vector-snapshot-5k.duckdb
  - status: READY
  - tables: vector_snapshot_packets_5k
  - views: none
  - field names: embedding_digest, feature_id, legacy_domain, normalized_domain, packet_key, qdrant_vector_dim, representation_id, representation_revision, semantic_embedding_768, source_ref, summary, title_id
- scripts/.tmp/atlas-vector-snapshots/atlas-vector-snapshot-5k-768.duckdb
  - status: READY
  - tables: vector_snapshot_packets_5k_768
  - views: none
  - field names: embedding_digest, feature_id, legacy_domain, normalized_domain, packet_key, qdrant_vector_dim, representation_id, representation_revision, semantic_embedding_768, source_ref, summary, title_id

## Checks

