# Qdrant Tag Mirror Audit

Generated: 2026-08-06T04:22:41.575Z
Status: APPLIED

## Summary

- input rows: 61659
- selected rows: 61659
- eligible rows: 6362
- patched rows: 6362
- skipped no qdrant_point_id: 55210
- skipped no qdrant_collection: 87
- skipped no changes: 0
- failures: 0
- patch rate: 100%

## Samples

- 0ba2345cd9c542fa | codebase_chunks_768 | 6154722635406530000 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, packet_kind, ledger_type, community_id, community_conf, qdrant_vector_dim, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 0bffe0382a0d44bb | codebase_chunks_768 | 6110266167187884000 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, packet_kind, ledger_type, community_id, community_conf, qdrant_vector_dim, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 0ee918abc8c53e8d | codebase_chunks_768 | 5039325894668581000 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, packet_kind, ledger_type, community_id, community_conf, qdrant_vector_dim, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 1703d9c005252a62 | codebase_chunks_768 | 8043140365143042000 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, packet_kind, ledger_type, community_id, community_conf, qdrant_vector_dim, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 175066b8a4ceee3c | codebase_chunks_768 | 7602461015851946000 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, packet_kind, ledger_type, community_id, community_conf, qdrant_vector_dim, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 17dc1fe9f5f8a021 | codebase_chunks_768 | 2247177181138465500 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, packet_kind, ledger_type, community_id, community_conf, qdrant_vector_dim, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 1d5eba7211dea6f9 | codebase_chunks_768 | 2565377371098813400 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, packet_kind, ledger_type, community_id, community_conf, qdrant_vector_dim, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 1dc5ac2b3cd9bfe8 | codebase_chunks_768 | 7101807950526120000 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, packet_kind, ledger_type, community_id, community_conf, qdrant_vector_dim, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at

## Next Safe Action

Run the materializer again only if the packet ledger changed; do not re-embed or recreate collections.
