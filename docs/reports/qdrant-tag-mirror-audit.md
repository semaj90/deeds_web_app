# Qdrant Tag Mirror Audit

Generated: 2026-07-24T05:09:25.681Z
Status: APPLIED

## Summary

- input rows: 58365
- selected rows: 58365
- eligible rows: 4627
- patched rows: 4627
- skipped no qdrant_point_id: 53640
- skipped no qdrant_collection: 98
- skipped no changes: 0
- failures: 0
- patch rate: 100%

## Samples

- 0ba2345cd9c542fa | codebase_chunks_768 | 6154722635406530000 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, concepts, packet_kind, ledger_type, community_id, community_conf, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 0bffe0382a0d44bb | codebase_chunks_768 | 6110266167187884000 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, concepts, packet_kind, ledger_type, community_id, community_conf, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 0ee918abc8c53e8d | codebase_chunks_768 | 5039325894668581000 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, concepts, packet_kind, ledger_type, community_id, community_conf, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 1703d9c005252a62 | codebase_chunks_768 | 8043140365143042000 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, concepts, packet_kind, ledger_type, community_id, community_conf, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 175066b8a4ceee3c | codebase_chunks_768 | 7602461015851946000 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, concepts, packet_kind, ledger_type, community_id, community_conf, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 17dc1fe9f5f8a021 | codebase_chunks_768 | 2247177181138465500 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, concepts, packet_kind, ledger_type, community_id, community_conf, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 1d5eba7211dea6f9 | codebase_chunks_768 | 2565377371098813400 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, concepts, packet_kind, ledger_type, community_id, community_conf, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at
- 1dc5ac2b3cd9bfe8 | codebase_chunks_768 | 7101807950526120000 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, concepts, packet_kind, ledger_type, community_id, community_conf, chunk_id, tree_node_id, embedding_ref, payload_backfilled_at

## Next Safe Action

Run the materializer again only if the packet ledger changed; do not re-embed or recreate collections.
