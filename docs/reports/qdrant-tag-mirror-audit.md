# Qdrant Tag Mirror Audit

Generated: 2026-06-18T15:31:54.264Z
Status: APPLIED

## Summary

- input rows: 100
- selected rows: 100
- eligible rows: 16
- patched rows: 16
- skipped no qdrant_point_id: 84
- skipped no qdrant_collection: 0
- skipped no changes: 0
- failures: 0
- patch rate: 100%

## Samples

- 05f26c6dc1b51a12 | codebase_chunks_768 | 99773549 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, packet_kind, ledger_type, qdrant_payload_key, qdrant_vector_dim, tree_node_id, glyph_record_id, embedding_ref, payload_backfilled_at
- 131a19548bb7040a | codebase_chunks_768 | 225294562 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, packet_kind, ledger_type, qdrant_payload_key, tree_node_id, glyph_record_id, neo4j_node_id, embedding_ref, payload_backfilled_at
- 16b72d0723810d7a | codebase_chunks_768 | 430336446 | packet_key, canonical_source_ref, source_ref, source_ref_key, feature_id, feature_label, lane_ids, tags, bm25_text, packet_kind, ledger_type, qdrant_payload_key, tree_node_id, glyph_record_id, neo4j_node_id, embedding_ref, payload_backfilled_at

## Next Safe Action

Run the materializer again only if the packet ledger changed; do not re-embed or recreate collections.
