# Packet Reader / Writer Audit

Generated: 2026-07-19T23:47:54.875Z
Status: MATERIALIZED
Source table: atlas_packets

## Summary

- ledger rows: 58365
- materialized rows: 58365
- addressable rows: 58365
- qdrant-backed rows: 4725
- qdrant collection rows: 4627
- bm25 rows: 58365
- concepts rows: 58360
- embedding ref rows: 4627
- evidence matches: 7690
- missing feature_id: 0
- missing canonical_source_ref: 0
- missing qdrant_point_id: 53640
- missing qdrant_collection: 53738

## Proof

- batching logic: PROVEN
- full materialization: PROVEN
- resume semantics: PROVEN
- atomic publication: PROVEN
- qdrant mirror: PROVEN
- identity coverage: STILL_PARTIAL
- proof states: BATCHING_LOGIC_PROVEN, FULL_MATERIALIZATION_PROVEN, RESUME_SEMANTICS_PROVEN, ATOMIC_PUBLICATION_PROVEN, QDRANT_MIRROR_PROVEN, IDENTITY_COVERAGE_STILL_PARTIAL

## Packet Kind Counts

- qdrant_chunk: 4700
- schema_stub: 1061
- mcp_tool_stub: 691
- legacy_qdrant_only: 0
- unknown: 0

## Evidence Scan

- files seen: 7
- files loaded: 7
- files skipped too large: 0
- records indexed: 8358

## Output

- ndjson: .tmp/addressable-packets.ndjson
- manifest: .tmp/addressable-packets.manifest.json
- sha256: bd3f1486aa405e26a0d9e7e45b3cfec5b91d5ec665832ff5ade35835e88bffcf

## Samples

- 0ba2345cd9c542fa | qdrant_chunk | grpc_service | codebase_chunks_768
- 0bffe0382a0d44bb | qdrant_chunk | grpc_service | codebase_chunks_768
- 0ee918abc8c53e8d | qdrant_chunk | grpc_service | codebase_chunks_768
- 1703d9c005252a62 | qdrant_chunk | grpc_service | codebase_chunks_768
- 175066b8a4ceee3c | qdrant_chunk | grpc_service | codebase_chunks_768
- 17dc1fe9f5f8a021 | qdrant_chunk | grpc_service | codebase_chunks_768
- 1d5eba7211dea6f9 | qdrant_chunk | grpc_service | codebase_chunks_768
- 1dc5ac2b3cd9bfe8 | qdrant_chunk | grpc_service | codebase_chunks_768

## Next Safe Action

Run qdrant-tag-mirror next, then resume the retrieval pipeline after the materialized packet count is positive.
