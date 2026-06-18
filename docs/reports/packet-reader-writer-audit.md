# Packet Reader / Writer Audit

Generated: 2026-06-18T15:28:24.394Z
Status: MATERIALIZED
Source table: atlas_higher_hop_index

## Summary

- ledger rows: 100
- materialized rows: 100
- addressable rows: 100
- qdrant-backed rows: 16
- qdrant collection rows: 16
- bm25 rows: 100
- concepts rows: 0
- embedding ref rows: 100
- evidence matches: 0
- missing feature_id: 0
- missing canonical_source_ref: 0
- missing qdrant_point_id: 84
- missing qdrant_collection: 84

## Packet Kind Counts

- qdrant_chunk: 0
- schema_stub: 0
- mcp_tool_stub: 100
- legacy_qdrant_only: 0
- unknown: 0

## Evidence Scan

- files seen: 4
- files loaded: 4
- files skipped too large: 0
- records indexed: 11322

## Output

- ndjson: .tmp/addressable-packets.ndjson
- manifest: .tmp/addressable-packets.manifest.json
- sha256: 7cb3c38a8d7df0fc998ab27bac14e8f46848a581c1661969c2799be9af28d57b

## Samples

- 05dbd8cc7c550bbe | mcp_tool_stub | 895884c03a86a386 | (no qdrant collection)
- 05f26c6dc1b51a12 | mcp_tool_stub | atlas.search | codebase_chunks_768
- 08dce8e980d1e261 | mcp_tool_stub | 4a0c3649b58e6c1e | (no qdrant collection)

## Next Safe Action

Run qdrant-tag-mirror next, then resume the retrieval pipeline after the materialized packet count is positive.
