# Contextual Tree Readiness Audit

Generated: 2026-06-05T17:23:18.205Z

## Summary

- overall: FIELD_NAME_MISMATCH
- READY: 3
- FIELD_NAME_MISMATCH: 3
- MATERIALIZATION_MISSING: 0
- SOURCE_UNAVAILABLE: 0
- DATA_ABSENT: 0

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
  - evidence: parent_atlas_documents:READY:5253 | route_runtime_packets:READY:33 | codebase_chunk_index:FIELD_NAME_MISMATCH:40754 | atlas_feature_map_synthesized:READY:14465 | atlas_feature_synthesis:FIELD_NAME_MISMATCH:12
  - actual field names: id, source_ref, feature_id, workspace_id, rel_path, file_ext, tags, summary, line_count, is_route, is_svelte_comp, has_auth, has_zod, drizzle_refs, imports, exports, route_handlers, payload, cluster_id, centroid_id, qdrant_point_id, alias_id, ingest_source, created_at, updated_at, related_feature_ids, source_kind, profile_card_visible, index_lane, summary_lod0, summary_lod1, summary_lod2, source_ref_id, captured_at, route, query_hash, query_preview, source_refs, feature_ids, lane_ids, som_cluster, qdrant_hits, redis_hot_keys, latency_ms, cache_hit, cache_tier, user_id, session_id, response_tokens, qdrant_id, relative_path, symbol, kind, line_start, line_end, content_embedding, gpu_cluster, page_rank_score, community_id, neo4j_meta, indexed_at, enriched_at, content, cluster_summary, summary_embedding, signature_embedding, domain, language, extension, embedding_model, summary_model, metadata, semantic_tags, som_bmu_row, som_bmu_col, manifold4, chunk_id, repo_id, content_hash, token_count, neo4j_gpu_cluster, output_meta, compressed_embedding, reconstruction_error, task_count, packet_count, ready_packet_count, last_packet_id, pickup_status, semantic_confidence, graph_distance, behavior_score, test_score, routing_score, runtime_state, last_verified_at, synthesized_at, atlas_file_count, qdrant_point_count, avg_confidence, max_confidence, primary_cluster_id, primary_centroid_id, cluster_ids, top_file_paths, synthesized_summary, next_actions, dominant_status, has_blocked, atlas_version
  - expected aliases present: feature_id, qdrant_point_id, source_ref, summary, feature_ids, qdrant_hits, som_cluster, source_refs, avg_confidence, primary_cluster_id
  - expected aliases missing: feature_id, qdrant_point_id, source_ref
- neo4j
  - status: FIELD_NAME_MISMATCH
  - evidence: SIMILAR_TOPOLOGY:165005 | SHARES_CLUSTER:147611 | CLASSIFIED_AS:19200 | BELONGS_TO_FEATURE:10506 | REFERENCES:7328 | MENTIONS:6445 | IMPORTS:6085 | IN_CLUSTER:5391 | HIGH_AUTHORITY:4696 | IN_SOM_CELL:4274 | HAS_NODE:3642 | CHILD_OF:3218 | BELONGS_TO_CLUSTER:1882 | ADJACENT_CLUSTER:1802 | CARD_EDGE:1406 | USES_TOOL:1385 | SEMANTIC_REL:990 | SUPPORTED_BY_SOURCE_REF:766 | HAS_DIRECTORY_SUMMARY:334 | DYNAMIC_IMPORTS:305 | TAGGED:283 | BELONGS_TO:275 | USES_DB:269 | USES_COMPONENT:229 | TEST_COVERS_FILE:156
  - actual field names: callees, classCount, cluster, communityId, complexity, consumedQueues, dynamicImportTargets, exportCount, exports, fetchedRoutes, filePath, fileSize, functions, gds_betweenness, gds_community, gds_pagerank, gpuCluster, graphAuthorityScore, graphPageRank, hasAuthGuard, hasCachePattern, hasDynamicImports, hasErrorHandling, hasRunesInPlainTs, hasSvelte4Events, hasSvelte4Props, hasSvelte4Reactive, hasZodValidation, id, importCount, isRouteFile, isSseEndpoint, isSvelteComponent, isWorkerBoundary, label, lineCount, maxCallDepth, nodeLabel, pagerank, publishedQueues, routeType, symbolCount, type, updatedAt, updatedAt.day, updatedAt.hour, updatedAt.minute, updatedAt.month, updatedAt.nanosecond, updatedAt.second, updatedAt.timeZoneId, updatedAt.timeZoneOffsetSeconds, updatedAt.year, usedTables, usesNative
  - expected aliases present: filePath
  - expected aliases missing: featureId, feature_id, file_path, sourceRef, source_ref
- qdrant
  - status: FIELD_NAME_MISMATCH
  - evidence: points=10 | payloadKeys=chunk_id, sourceRef, file_path, root, area, kind, tags, agent_area, feature_status, centroid_id, content_hash, schema_version
  - actual field names: id, payload, payload.agent_area, payload.area, payload.centroid_id, payload.chunk_id, payload.chunk_index, payload.cluster_id, payload.complexity, payload.content, payload.content_hash, payload.dependency_cluster, payload.domain, payload.extension, payload.feature_id, payload.feature_ids, payload.feature_label, payload.feature_status, payload.file_name, payload.file_path, payload.gpuCluster, payload.gpu_cluster, payload.hot_keyword_cluster, payload.indexed_at, payload.kind, payload.lane_ids, payload.parent_atlas_card_id, payload.phase_lane, payload.purpose, payload.related_feature_ids, payload.relativePath, payload.root, payload.schema_version, payload.somCol, payload.somRow, payload.som_cluster, payload.sourceRef, payload.sourceRefs, payload.source_refs, payload.tags, payload.total_chunks
  - expected aliases present: payload.feature_id, payload.file_path, payload.som_cluster
  - expected aliases missing: feature_id, file_path, payload.qdrant_point_id, payload.source_ref, qdrant_point_id, som_cluster, source_ref
- duckdb
  - status: READY
  - evidence: tables=card_enriched, cluster_summary, edges_all, lane_summary, node_degree, node_degree_agg, nodes_all, parent_atlas_full | views=none | tables=cards_raw, outcomes_raw, training_examples | views=atlas_cards_enriched, cluster_summary, parent_atlas_index | tables=hidden_packet_pathmap, hidden_packet_pathmap_summary | views=none | tables=atlas_feature_map, mapreduce_consolidated_index, mapreduce_consolidated_index_meta | views=none | tables=cards_raw, outcomes_raw, training_examples | views=atlas_cards_enriched, cluster_summary, parent_atlas_index
  - actual field names: avg_reward, card_count, card_id, cards_with_rewards, cluster_avg_reward, cluster_size, column0, degree, edge_type, from_node_id, lane, node_count, node_id, out_degree, payload_json, reward_avg, reward_count, som_col, som_index, som_row, sourceRef, title, to_node_id, total_degree, total_outcomes, unique_sources, weight, cardId, created_at, enrichment_phase, id, input, instruction, kind, output, reward, reward_total, som_bmu_col, som_bmu_distance, som_bmu_row, som_cluster_col, som_cluster_row, vector64_compressed, bucket, bucket_rows, description, duckdb_rows, feature_id, feature_ids, feature_key, file, joined_rows, line_number, packet_kind, path, pathmap_root, section, source, source_ref, source_ref_joins, source_refs, stable_id, stable_id_joins, status, task_id, todo_source_ref_rows, atlas_version, centroid_id, cluster_id, colocatedFiles, contentHash, directory, dynamicImports, dynamic_imports, extension, extensions, feature, features, fileName, filePath, importErrorCount, indexed_at, keywords, lane_ids, lastScanned, lines, metadata, neo4j_node_id, nes_card_id, normalized_path, qdrant_point_id, related_feature_ids, resolvedDynamicImports, resolvedStaticImports, rows, semanticMarkers, size, som_cluster, source_id, stableKey, staticImports, static_imports, labels, payload, score_authority, score_rank, score_recency, sourceRefs, summary, term_type, term_value
  - expected aliases present: sourceRef, feature_id, source_ref
  - expected aliases missing: featureId, feature_id, source_ref, sourceRef
- couchdb
  - status: READY
  - evidence: code_relations_runs/_design/by_run:by_run | code_relations_runs/_design/by_type:by_type
  - actual field names: none
  - expected aliases present: none
  - expected aliases missing: none
- packets
  - status: READY
  - evidence: tmpJsonlFiles=75 | tmpNdjsonFiles=52 | sourceRefHits=70745 | featureIdHits=0 | keySamples=file, calls, reasons, path, size, mtime, ext, sourceRef, edgeType, from, to, spec
  - actual field names: none
  - expected aliases present: none
  - expected aliases missing: none

## Packet Surfaces

- tmp JSONL files discovered: 75
- tmp NDJSON files discovered: 52
- source_ref hits in sampled JSONL files: 70745
- feature_id hits in sampled JSONL files: 0

## DuckDB Inventory

- .tmp/ingest/atlas.duckdb
  - status: READY
  - tables: card_enriched, cluster_summary, edges_all, lane_summary, node_degree, node_degree_agg, nodes_all, parent_atlas_full
  - views: none
  - field names: avg_reward, card_count, card_id, cards_with_rewards, cluster_avg_reward, cluster_size, column0, degree, edge_type, from_node_id, lane, node_count, node_id, out_degree, payload_json, reward_avg, reward_count, som_col, som_index, som_row, sourceRef, title, to_node_id, total_degree, total_outcomes, unique_sources, weight
- duckdb/atlas.duckdb
  - status: READY
  - tables: cards_raw, outcomes_raw, training_examples
  - views: atlas_cards_enriched, cluster_summary, parent_atlas_index
  - field names: cardId, created_at, enrichment_phase, id, input, instruction, kind, output, reward, reward_avg, reward_count, reward_total, som_bmu_col, som_bmu_distance, som_bmu_row, som_cluster_col, som_cluster_row, sourceRef, vector64_compressed
- docs/reports/hidden-packet-pathmap.duckdb
  - status: READY
  - tables: hidden_packet_pathmap, hidden_packet_pathmap_summary
  - views: none
  - field names: bucket, bucket_rows, description, duckdb_rows, feature_id, feature_ids, feature_key, file, joined_rows, line_number, packet_kind, path, pathmap_root, section, source, source_ref, source_ref_joins, source_refs, stable_id, stable_id_joins, status, task_id, title, todo_source_ref_rows
- docs/reports/offline-synthesis-mapreduce.duckdb
  - status: READY
  - tables: atlas_feature_map, mapreduce_consolidated_index, mapreduce_consolidated_index_meta
  - views: none
  - field names: atlas_version, centroid_id, cluster_id, colocatedFiles, contentHash, directory, dynamicImports, dynamic_imports, extension, extensions, feature, feature_id, features, fileName, filePath, importErrorCount, indexed_at, keywords, lane_ids, lastScanned, lines, metadata, neo4j_node_id, nes_card_id, normalized_path, qdrant_point_id, related_feature_ids, resolvedDynamicImports, resolvedStaticImports, rows, semanticMarkers, size, som_cluster, source_id, source_ref, stableKey, staticImports, static_imports
- sveltekit-frontend/.tmp/duckdb/atlas.duckdb
  - status: READY
  - tables: cards_raw, outcomes_raw, training_examples
  - views: atlas_cards_enriched, cluster_summary, parent_atlas_index
  - field names: cardId, created_at, enrichment_phase, id, input, instruction, kind, output, reward, reward_avg, reward_count, reward_total, som_bmu_col, som_bmu_distance, som_bmu_row, som_cluster_col, som_cluster_row, sourceRef, vector64_compressed
- sveltekit-frontend/docs/reports/feature-card.duckdb
  - status: DATA_ABSENT
  - tables: feature_card_terms, feature_cards
  - views: none
  - field names: card_id, id, kind, labels, payload, score_authority, score_rank, score_recency, sourceRefs, summary, term_type, term_value

## Checks

