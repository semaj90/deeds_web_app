# Packet Reader / Writer Audit

Generated: 2026-08-09T02:50:06.105Z
Status: MATERIALIZED
Source table: atlas_packets

## Summary

- ledger rows: 61659
- materialized rows: 61659
- addressable rows: 61658
- qdrant-backed rows: 6451
- qdrant collection rows: 6365
- bm25 rows: 61659
- concepts rows: 0
- embedding ref rows: 6365
- evidence matches: 10474
- load batches: 62
- max page query ms: 1594
- max page parse ms: 0
- max page raw bytes: 17979474
- max page normalized bytes: 17979472
- missing feature_id: 0
- missing canonical_source_ref: 1
- missing qdrant_point_id: 55208
- missing qdrant_collection: 55294
- duplicate packets skipped: 0

## Proof

- batching logic: PROVEN
- full materialization: PROVEN
- resume semantics: RESUME_SEMANTICS_NOT_YET_PROVEN
- atomic publication: PROVEN
- qdrant mirror: PROVEN
- identity coverage: STILL_PARTIAL
- proof states: BATCHING_LOGIC_PROVEN, FULL_MATERIALIZATION_PROVEN, RESUME_SEMANTICS_NOT_YET_PROVEN, ATOMIC_PUBLICATION_PROVEN, QDRANT_MIRROR_PROVEN, IDENTITY_COVERAGE_STILL_PARTIAL

## Packet Kind Counts

- qdrant_chunk: 7985
- schema_stub: 1061
- mcp_tool_stub: 703
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
- sha256: e37c231318105aea1a707c965d8d997688625edc76a651d64079e772e62f6c80

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
