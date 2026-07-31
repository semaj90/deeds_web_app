# Packet Reader / Writer Audit

Generated: 2026-07-30T20:43:36.750Z
Status: MATERIALIZED
Source table: atlas_packets

## Summary

- ledger rows: 5
- materialized rows: 5
- addressable rows: 5
- qdrant-backed rows: 5
- qdrant collection rows: 5
- bm25 rows: 5
- concepts rows: 0
- embedding ref rows: 5
- evidence matches: 0
- load batches: 1
- max page query ms: 60
- max page parse ms: 0
- max page raw bytes: 71288
- max page normalized bytes: 71286
- missing feature_id: 0
- missing canonical_source_ref: 0
- missing qdrant_point_id: 0
- missing qdrant_collection: 0
- duplicate packets skipped: 0

## Proof

- batching logic: PROVEN
- full materialization: NOT_YET_PROVEN
- resume semantics: RESUME_SEMANTICS_NOT_YET_PROVEN
- atomic publication: PROVEN
- qdrant mirror: PROVEN
- identity coverage: COMPLETE
- proof states: BATCHING_LOGIC_PROVEN, FULL_MATERIALIZATION_NOT_YET_PROVEN, RESUME_SEMANTICS_NOT_YET_PROVEN, ATOMIC_PUBLICATION_PROVEN, QDRANT_MIRROR_PROVEN, IDENTITY_COVERAGE_COMPLETE

## Packet Kind Counts

- qdrant_chunk: 5
- schema_stub: 0
- mcp_tool_stub: 0
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
- sha256: 7084bc8c473ec251ca9c291594e028738284de23609d0d0c78a2007efb06df3a

## Samples

- 0ba2345cd9c542fa | qdrant_chunk | grpc_service | codebase_chunks_768
- 0bffe0382a0d44bb | qdrant_chunk | grpc_service | codebase_chunks_768
- 0ee918abc8c53e8d | qdrant_chunk | grpc_service | codebase_chunks_768
- 1703d9c005252a62 | qdrant_chunk | grpc_service | codebase_chunks_768
- 175066b8a4ceee3c | qdrant_chunk | grpc_service | codebase_chunks_768

## Next Safe Action

Run qdrant-tag-mirror next, then resume the retrieval pipeline after the materialized packet count is positive.
