# Packet Reader / Writer Audit

Generated: 2026-06-28T23:53:18.021Z
Status: MATERIALIZED
Source table: atlas_packets

## Summary

- ledger rows: 58304
- materialized rows: 58304
- addressable rows: 58304
- qdrant-backed rows: 0
- qdrant collection rows: 0
- bm25 rows: 58304
- concepts rows: 0
- embedding ref rows: 0
- evidence matches: 7501
- missing feature_id: 0
- missing canonical_source_ref: 0
- missing qdrant_point_id: 58304
- missing qdrant_collection: 58304

## Packet Kind Counts

- qdrant_chunk: 56552
- schema_stub: 1061
- mcp_tool_stub: 691
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
- sha256: e07266cc33bafc81244eb32a844ae35c0594b676fc1497b79df4421f0a95ca89

## Samples

- packet:0003260092b1 | qdrant_chunk | sveltekit-frontend.llm_synthesis_mapping | (no qdrant collection)
- packet:0003850e84ca | qdrant_chunk | sveltekit-frontend.tests__cases-sub-routes.spec | (no qdrant collection)
- packet:0003ab694534 | qdrant_chunk | sveltekit-frontend.tests__routes__auto__api__cache__metrics.test | (no qdrant collection)
- packet:0003dda5e534 | qdrant_chunk | neschrom97.93f973562fff24ed | (no qdrant collection)
- packet:0004b466d863 | qdrant_chunk | .svelte-error-fixes-backup.+layout | (no qdrant collection)
- packet:0004f849be72 | qdrant_chunk | sveltekit-frontend.sprint5-6-monitoring.spec | (no qdrant collection)
- packet:0006ca4a45e3 | qdrant_chunk | sveltekit-frontend.launch-2026-06-25T22-12-53-881Z | (no qdrant collection)
- packet:0008d535a1f6 | qdrant_chunk | llama-cpp-turboquant-gemma4.completion | (no qdrant collection)

## Next Safe Action

Run qdrant-tag-mirror next, then resume the retrieval pipeline after the materialized packet count is positive.
