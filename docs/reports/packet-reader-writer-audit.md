# Packet Reader / Writer Audit

Generated: 2026-06-23T19:57:21.743Z
Status: MATERIALIZED
Source table: atlas_higher_hop_index

## Summary

- ledger rows: 3251
- materialized rows: 3251
- addressable rows: 3251
- qdrant-backed rows: 2488
- qdrant collection rows: 2488
- bm25 rows: 3251
- concepts rows: 0
- embedding ref rows: 3251
- evidence matches: 2467
- missing feature_id: 0
- missing canonical_source_ref: 0
- missing qdrant_point_id: 763
- missing qdrant_collection: 763

## Packet Kind Counts

- qdrant_chunk: 2454
- schema_stub: 597
- mcp_tool_stub: 145
- legacy_qdrant_only: 0
- unknown: 0

## Evidence Scan

- files seen: 8
- files loaded: 8
- files skipped too large: 0
- records indexed: 8359

## Output

- ndjson: .tmp/addressable-packets.ndjson
- manifest: .tmp/addressable-packets.manifest.json
- sha256: 8d49d141d01849ca08378f07b629a368dbe4882f8bceda3bca7888d6cb870277

## Samples

- 05dbd8cc7c550bbe | mcp_tool_stub | 895884c03a86a386 | (no qdrant collection)
- 05f26c6dc1b51a12 | mcp_tool_stub | atlas.search | codebase_chunks_768
- 08dce8e980d1e261 | mcp_tool_stub | 4a0c3649b58e6c1e | (no qdrant collection)
- 0e584542cbd3ec1f | mcp_tool_stub | 121b02dff31f995b | (no qdrant collection)
- 106474ac880329aa | mcp_tool_stub | 931687f31329e048 | (no qdrant collection)
- 1125b964826d67d7 | mcp_tool_stub | 6a545f1e8ce22358 | (no qdrant collection)
- 119403f1ca0164b4 | mcp_tool_stub | 5a8f718e6f8c271a | (no qdrant collection)
- 13039d77318546e0 | mcp_tool_stub | 4521761888863c86 | (no qdrant collection)

## Next Safe Action

Run qdrant-tag-mirror next, then resume the retrieval pipeline after the materialized packet count is positive.
