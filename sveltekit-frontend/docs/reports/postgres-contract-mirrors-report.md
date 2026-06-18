# Postgres Contract Mirrors

Generated: 2026-06-18T21:27:18.700Z

## Inputs

- drizzle SQL: drizzle
- Drizzle schema TS: src/lib/server/db
- schema-postgres.ts: src/lib/server/db/schema-postgres.ts
- live Postgres: reachable

## Summary

- tables audited: 8
- live reachable: yes
- classification counts: {"LIVE_DB_ALIGNED":7,"COLUMN_MISMATCH":1}

## Table Mirror Status

| Table | Classification | Live | Schema files | SQL files | Column diff | Index diff |
| --- | --- | --- | --- | --- | --- | --- |
| task_semantic_packets | LIVE_DB_ALIGNED | PRESENT | 1 | 6 | clean | clean |
| parent_atlas_jobs | LIVE_DB_ALIGNED | PRESENT | 1 | 1 | clean | clean |
| atlas_feature_map | LIVE_DB_ALIGNED | PRESENT | 1 | 5 | clean | clean |
| parent_atlas_documents | LIVE_DB_ALIGNED | PRESENT | 1 | 1 | clean | clean |
| atlas_feature_map_synthesized | LIVE_DB_ALIGNED | PRESENT | 1 | 1 | clean | clean |
| route_runtime_packets | LIVE_DB_ALIGNED | PRESENT | 1 | 3 | clean | clean |
| nes_chrom_packets | COLUMN_MISMATCH | PRESENT | 1 | 5 | diff | clean |
| nes_chrom_kag_dag_hits | LIVE_DB_ALIGNED | PRESENT | 1 | 3 | clean | clean |

## Non-Green Details

### nes_chrom_packets

- classification: COLUMN_MISMATCH
- recommended repair: APPLY_EXISTING_SQL
- SQL columns: canonical, chunk_id, community_confidence, community_id, community_source, confidence_score, created_at, domain_class, embedding, feature_code, feature_id, feature_ids, feature_label, file_path, id, kag_dag_run_id, kag_node_key, kmeans_cluster, lane, lane_ids, ledger_type, lineage_version, metadata, model, packet_key, packet_type, packet_zstd, payload, payload_backfilled_at, permissions, qdrant_point_id, query_hash, som_cluster, som_code, som_col, som_index, som_row, source_ref, source_ref_id, source_refs, summary, tags, token_budget, updated_at
- Drizzle columns: betweenness, canonical, chunk_id, community_confidence, community_id, community_source, confidence_score, created_at, domain_class, eigenvector, embedding, feature_code, feature_id, feature_ids, feature_label, file_path, id, identity_lane, kag_dag_run_id, kag_node_key, kmeans_cluster, lane, lane_ids, ledger_type, lineage_version, metadata, model, neo4j_node_id, packet_key, packet_type, packet_zstd, pagerank, payload, payload_backfilled_at, permissions, qdrant_point_id, query_hash, redis_centroid_key, som_cluster, som_code, som_col, som_index, som_row, source_ref, source_ref_id, source_refs, summary, tags, token_budget, topology, updated_at, vectors
- live DB columns: betweenness, canonical, chunk_id, community_confidence, community_id, community_source, confidence_score, created_at, domain_class, eigenvector, embedding, feature_code, feature_id, feature_ids, feature_label, file_path, id, kag_dag_run_id, kag_node_key, kmeans_cluster, lane, lane_ids, ledger_type, lineage_version, metadata, model, neo4j_node_id, packet_key, packet_type, packet_zstd, pagerank, payload, payload_backfilled_at, permissions, qdrant_point_id, query_hash, redis_centroid_key, som_cluster, som_code, som_col, som_index, som_row, source_ref, source_ref_id, source_refs, summary, tags, token_budget, topology, updated_at, vectors
- missing columns by side: schemaOnly=[betweenness, eigenvector, identity_lane, neo4j_node_id, pagerank, redis_centroid_key, topology, vectors], sqlOnly=[], liveOnly=[], missingInLive=[identity_lane]
- SQL indexes: idx_nes_chrom_packets_betweenness, idx_nes_chrom_packets_community_confidence_idx, idx_nes_chrom_packets_community_id_idx, idx_nes_chrom_packets_community_source_idx, idx_nes_chrom_packets_domain_class_idx, idx_nes_chrom_packets_eigenvector, idx_nes_chrom_packets_feature_id, idx_nes_chrom_packets_feature_id_idx, idx_nes_chrom_packets_feature_ids_gin, idx_nes_chrom_packets_feature_label_idx, idx_nes_chrom_packets_feature_source, idx_nes_chrom_packets_kmeans_cluster_idx, idx_nes_chrom_packets_lane_ids_gin, idx_nes_chrom_packets_ledger_type_idx, idx_nes_chrom_packets_lineage_version_idx, idx_nes_chrom_packets_metadata_gin, idx_nes_chrom_packets_neo4j_node_id, idx_nes_chrom_packets_packet_key_idx, idx_nes_chrom_packets_pagerank, idx_nes_chrom_packets_permissions_gin, idx_nes_chrom_packets_redis_centroid_key, idx_nes_chrom_packets_som_cluster, idx_nes_chrom_packets_som_index_idx, idx_nes_chrom_packets_source_ref, idx_nes_chrom_packets_source_ref_idx, idx_nes_chrom_packets_tags_gin, idx_nes_chrom_packets_topology_gin, idx_nes_chrom_packets_vectors_gin, nes_chrom_packets_chunk_id_idx, nes_chrom_packets_confidence_score_idx, nes_chrom_packets_embedding_hnsw, nes_chrom_packets_feature_code_idx, nes_chrom_packets_feature_id_idx, nes_chrom_packets_kag_run_idx, nes_chrom_packets_norm_source_ref_trgm_idx, nes_chrom_packets_packet_key_key, nes_chrom_packets_packet_zstd_idx, nes_chrom_packets_payload_gin, nes_chrom_packets_qdrant_point_idx, nes_chrom_packets_query_hash_idx, nes_chrom_packets_som_code_idx, nes_chrom_packets_source_ref_id_idx, nes_chrom_packets_source_ref_idx, nes_chrom_packets_source_ref_trgm_idx, nes_chrom_packets_source_refs_gin, nes_chrom_packets_summary_trgm_idx
- Drizzle/index hints: idx_nes_chrom_packets_betweenness, idx_nes_chrom_packets_community_confidence_idx, idx_nes_chrom_packets_community_id_idx, idx_nes_chrom_packets_community_source_idx, idx_nes_chrom_packets_domain_class_idx, idx_nes_chrom_packets_eigenvector, idx_nes_chrom_packets_feature_id, idx_nes_chrom_packets_feature_id_idx, idx_nes_chrom_packets_feature_ids_gin, idx_nes_chrom_packets_feature_label_idx, idx_nes_chrom_packets_feature_source, idx_nes_chrom_packets_kmeans_cluster_idx, idx_nes_chrom_packets_lane_ids_gin, idx_nes_chrom_packets_ledger_type_idx, idx_nes_chrom_packets_lineage_version_idx, idx_nes_chrom_packets_metadata_gin, idx_nes_chrom_packets_neo4j_node_id, idx_nes_chrom_packets_packet_key_idx, idx_nes_chrom_packets_pagerank, idx_nes_chrom_packets_permissions_gin, idx_nes_chrom_packets_redis_centroid_key, idx_nes_chrom_packets_som_cluster, idx_nes_chrom_packets_som_index_idx, idx_nes_chrom_packets_source_ref, idx_nes_chrom_packets_source_ref_idx, idx_nes_chrom_packets_tags_gin, idx_nes_chrom_packets_topology_gin, idx_nes_chrom_packets_vectors_gin, nes_chrom_packets_chunk_id_idx, nes_chrom_packets_confidence_score_idx, nes_chrom_packets_embedding_hnsw, nes_chrom_packets_feature_code_idx, nes_chrom_packets_feature_id_idx, nes_chrom_packets_kag_run_idx, nes_chrom_packets_norm_source_ref_trgm_idx, nes_chrom_packets_packet_key_key, nes_chrom_packets_packet_zstd_idx, nes_chrom_packets_payload_gin, nes_chrom_packets_qdrant_point_idx, nes_chrom_packets_query_hash_idx, nes_chrom_packets_som_code_idx, nes_chrom_packets_source_ref_id_idx, nes_chrom_packets_source_ref_idx, nes_chrom_packets_source_ref_trgm_idx, nes_chrom_packets_source_refs_gin, nes_chrom_packets_summary_trgm_idx
- live user-defined indexes: idx_nes_chrom_packets_betweenness, idx_nes_chrom_packets_community_confidence_idx, idx_nes_chrom_packets_community_id_idx, idx_nes_chrom_packets_community_source_idx, idx_nes_chrom_packets_domain_class_idx, idx_nes_chrom_packets_eigenvector, idx_nes_chrom_packets_feature_id, idx_nes_chrom_packets_feature_id_idx, idx_nes_chrom_packets_feature_ids_gin, idx_nes_chrom_packets_feature_label_idx, idx_nes_chrom_packets_feature_source, idx_nes_chrom_packets_kmeans_cluster_idx, idx_nes_chrom_packets_lane_ids_gin, idx_nes_chrom_packets_ledger_type_idx, idx_nes_chrom_packets_lineage_version_idx, idx_nes_chrom_packets_metadata_gin, idx_nes_chrom_packets_neo4j_node_id, idx_nes_chrom_packets_packet_key_idx, idx_nes_chrom_packets_pagerank, idx_nes_chrom_packets_permissions_gin, idx_nes_chrom_packets_redis_centroid_key, idx_nes_chrom_packets_som_cluster, idx_nes_chrom_packets_som_index_idx, idx_nes_chrom_packets_source_ref, idx_nes_chrom_packets_source_ref_idx, idx_nes_chrom_packets_tags_gin, idx_nes_chrom_packets_topology_gin, idx_nes_chrom_packets_vectors_gin, nes_chrom_packets_chunk_id_idx, nes_chrom_packets_confidence_score_idx, nes_chrom_packets_embedding_hnsw, nes_chrom_packets_feature_code_idx, nes_chrom_packets_feature_id_idx, nes_chrom_packets_kag_run_idx, nes_chrom_packets_norm_source_ref_trgm_idx, nes_chrom_packets_packet_key_key, nes_chrom_packets_packet_zstd_idx, nes_chrom_packets_payload_gin, nes_chrom_packets_qdrant_point_idx, nes_chrom_packets_query_hash_idx, nes_chrom_packets_som_code_idx, nes_chrom_packets_source_ref_id_idx, nes_chrom_packets_source_ref_idx, nes_chrom_packets_source_ref_trgm_idx, nes_chrom_packets_source_refs_gin, nes_chrom_packets_summary_trgm_idx


## Notes

- SQL_ONLY means the manual sidecar exists without a Drizzle schema mirror.
- DRIZZLE_ONLY means the Drizzle schema exists without a manual SQL mirror.
- LIVE_DB_ALIGNED means the live table matched the mirror definitions.
- COLUMN_MISMATCH and INDEX_MISMATCH are hard contract drift signals.
- SCHEMA_AND_SQL_ALIGNED is used when the static mirrors agree but the live DB is not available.
- Primary-key indexes are ignored in live comparisons because they are implicit, not contract drift.
