# Contextual Tree Readiness Audit

Generated: 2026-06-05T20:03:28.854Z

## Summary

- overall: SOURCE_UNAVAILABLE
- READY: 2
- FIELD_NAME_MISMATCH: 0
- SOURCE_UNAVAILABLE: 4
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
  - status: SOURCE_UNAVAILABLE
  - evidence: connect ECONNREFUSED 127.0.0.1:5434
  - actual field names: none
  - expected aliases present: none
  - expected aliases missing: none
- neo4j
  - status: SOURCE_UNAVAILABLE
  - evidence: Failed to connect to server. Please ensure that your database is listening on the correct host and port and that you have compatible encryption settings both on Neo4j server and driver. Note that the default encryption setting has changed in Neo4j 4.0.
  - actual field names: none
  - expected aliases present: none
  - expected aliases missing: none
- qdrant
  - status: SOURCE_UNAVAILABLE
  - evidence: fetch failed
  - actual field names: none
  - expected aliases present: none
  - expected aliases missing: none
- duckdb
  - status: READY
  - evidence: tables=cards_raw, outcomes_raw, training_examples | views=atlas_cards_enriched, cluster_summary, parent_atlas_index | tables=atlas_feature_map, mapreduce_consolidated_index, mapreduce_consolidated_index_meta | views=none | tables=hidden_packet_pathmap, hidden_packet_pathmap_summary | views=none | tables=card_enriched, cluster_summary, edges_all, lane_summary, node_degree, node_degree_agg, nodes_all, parent_atlas_full | views=none | tables=feature_card_terms, feature_cards | views=none
  - actual field names: cardId, created_at, enrichment_phase, id, input, instruction, kind, output, reward, reward_avg, reward_count, reward_total, som_bmu_col, som_bmu_distance, som_bmu_row, som_cluster_col, som_cluster_row, sourceRef, vector64_compressed, atlas_version, centroid_id, cluster_id, colocatedFiles, contentHash, directory, dynamicImports, dynamic_imports, extension, extensions, feature, feature_id, features, fileName, filePath, importErrorCount, indexed_at, keywords, lane_ids, lastScanned, lines, metadata, neo4j_node_id, nes_card_id, normalized_path, qdrant_point_id, related_feature_ids, resolvedDynamicImports, resolvedStaticImports, rows, semanticMarkers, size, som_cluster, source_id, source_ref, stableKey, staticImports, static_imports, bucket, bucket_rows, description, duckdb_rows, feature_ids, feature_key, file, joined_rows, line_number, packet_kind, path, pathmap_root, section, source, source_ref_joins, source_refs, stable_id, stable_id_joins, status, task_id, title, todo_source_ref_rows, avg_reward, card_count, card_id, cards_with_rewards, cluster_avg_reward, cluster_size, column0, degree, edge_type, from_node_id, lane, node_count, node_id, out_degree, payload_json, som_col, som_index, som_row, to_node_id, total_degree, total_outcomes, unique_sources, weight, labels, payload, score_authority, score_rank, score_recency, sourceRefs, summary, term_type, term_value
  - expected aliases present: sourceRef, feature_id, source_ref
  - expected aliases missing: featureId, feature_id, source_ref, sourceRef
- couchdb
  - status: SOURCE_UNAVAILABLE
  - evidence: fetch failed
  - actual field names: none
  - expected aliases present: none
  - expected aliases missing: none
- packets
  - status: READY
  - evidence: tmpJsonlFiles=75 | tmpNdjsonFiles=52 | sourceRefHits=70757 | featureIdHits=0 | keySamples=file, calls, reasons, path, size, mtime, ext, sourceRef, edgeType, from, to, spec
  - actual field names: none
  - expected aliases present: none
  - expected aliases missing: none

## Packet Surfaces

- tmp JSONL files discovered: 75
- tmp NDJSON files discovered: 52
- source_ref hits in sampled JSONL files: 70757
- feature_id hits in sampled JSONL files: 0

## DuckDB Inventory

- duckdb/atlas.duckdb
  - status: READY
  - tables: cards_raw, outcomes_raw, training_examples
  - views: atlas_cards_enriched, cluster_summary, parent_atlas_index
  - field names: cardId, created_at, enrichment_phase, id, input, instruction, kind, output, reward, reward_avg, reward_count, reward_total, som_bmu_col, som_bmu_distance, som_bmu_row, som_cluster_col, som_cluster_row, sourceRef, vector64_compressed
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
- .tmp/ingest/atlas.duckdb
  - status: READY
  - tables: card_enriched, cluster_summary, edges_all, lane_summary, node_degree, node_degree_agg, nodes_all, parent_atlas_full
  - views: none
  - field names: avg_reward, card_count, card_id, cards_with_rewards, cluster_avg_reward, cluster_size, column0, degree, edge_type, from_node_id, lane, node_count, node_id, out_degree, payload_json, reward_avg, reward_count, som_col, som_index, som_row, sourceRef, title, to_node_id, total_degree, total_outcomes, unique_sources, weight
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

## Checks

