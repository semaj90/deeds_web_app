# Packet Reader / Writer Audit

Generated: 2026-07-29T05:52:32.147Z
Status: DRY_RUN_READY
Source table: atlas_packets

## Summary

- ledger rows: 1
- materialized rows: 1
- addressable rows: 1
- qdrant-backed rows: 1
- qdrant collection rows: 1
- bm25 rows: 1
- concepts rows: 1
- embedding ref rows: 1
- evidence matches: 0
- missing feature_id: 0
- missing canonical_source_ref: 0
- missing qdrant_point_id: 0
- missing qdrant_collection: 0

## Proof

- batching logic: PROVEN
- full materialization: NOT_YET_PROVEN
- resume semantics: RESUME_SEMANTICS_NOT_YET_PROVEN
- atomic publication: ATOMIC_PUBLICATION_NOT_YET_PROVEN
- qdrant mirror: PROVEN
- identity coverage: COMPLETE
- proof states: BATCHING_LOGIC_PROVEN, FULL_MATERIALIZATION_NOT_YET_PROVEN, RESUME_SEMANTICS_NOT_YET_PROVEN, ATOMIC_PUBLICATION_NOT_YET_PROVEN, QDRANT_MIRROR_PROVEN, IDENTITY_COVERAGE_COMPLETE

## Packet Kind Counts

- qdrant_chunk: 1
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
- sha256: 82e5ac9a4c24df007331ce59a828b8e9f65e04efcf10168b23b64d6f96a23e39

## Samples

- 0ba2345cd9c542fa | qdrant_chunk | grpc_service | codebase_chunks_768

## Next Safe Action

Run qdrant-tag-mirror next, then resume the retrieval pipeline after the materialized packet count is positive.
