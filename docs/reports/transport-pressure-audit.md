# Transport Pressure Audit

Generated: 2026-06-12T02:02:29.148Z
Recommended level: LEVEL_2_BINARY_TRANSPORT
Reason: RabbitMQ/NATS is reachable, so bounded binary transport is justified

## Summary

- packet files scanned: 9952
- text packet rows: 788925
- JSON files: 9521
- NDJSON files: 90
- JSONL files: 316
- MessagePack files: 25
- total artifact bytes: 2.60 GB
- largest artifact: .tmp/simd-adaptive-parser.json (374.29 MB)
- Node parse risk: HIGH (100/100)

## Largest JSON Files

- .tmp/simd-adaptive-parser.json (374.29 MB)
- .tmp/gpu-som-checkpoint/scroll_vectors.json (225.23 MB)
- docs/reports/ignored-directory-audit.json (152.46 MB)
- .tmp/gpu-som-checkpoint/scroll_meta.json (148.71 MB)
- docs/reports/ignored-directory-audit.min.json (133.45 MB)
- sveltekit-frontend/.tmp/offline-analysis/fe-graph-deep-import-graph.json (56.93 MB)
- sveltekit-frontend/docs/graph/deep-import-graph.json (56.93 MB)
- sveltekit-frontend/.tmp/offline-analysis/fe-graph-codebase-graph.json (49.52 MB)
- .tmp/calls-neo4j-dryrun.json (33.96 MB)
- docs/graph/repo-root-atlas.json (28.47 MB)
- sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-root-atlas.json (28.47 MB)
- sveltekit-frontend/.tmp/offline-analysis/fe-graph-sveltekit-route-gap-atlas.json (27.51 MB)

## Largest NDJSON Files

- .tmp/mapreduce-full-v4.ndjson (110.15 MB, rows=3270)
- .tmp/mapreduce-full-v3.ndjson (105.06 MB, rows=3213)
- .tmp/mapreduce-full-v2.ndjson (104.88 MB, rows=3213)
- .tmp/mapreduce-full.ndjson (104.58 MB, rows=3213)
- .tmp/ingest/nodes.ndjson (89.57 MB, rows=9372)
- .tmp/calls-edges-clean.ndjson (25.75 MB, rows=164909)
- scripts/atlas/out/calls-edges-2026-05-29.ndjson (23.45 MB, rows=106515)
- .tmp/chunks/feature-chunks.ndjson (4.72 MB, rows=13722)
- .tmp/ingest/parent_atlas_gpu.ndjson (4.40 MB, rows=10751)
- neschrom97/packets/cards.ndjson (3.81 MB, rows=8170)
- .tmp/offline-synthesis/hidden-packet-pathmap.ndjson (3.56 MB, rows=6353)
- memory/exports/reports.ndjson (2.54 MB, rows=50)

## Largest JSONL Files

- scripts/court_data/coastalcph__lex_glue__train.jsonl (172.77 MB, rows=5000)
- scripts/court_data/coastalcph__lex_glue__test.jsonl (73.63 MB, rows=1400)
- scripts/court_data/coastalcph__lex_glue__validation.jsonl (72.99 MB, rows=1400)
- memory/graphify/deep/deep-import-edges.jsonl (17.13 MB, rows=81136)
- .tmp/calls-edges.jsonl (15.07 MB, rows=111945)
- .tmp/calls.jsonl (8.48 MB, rows=19734)
- .tmp/calls-unresolved.jsonl (8.44 MB, rows=19656)
- sveltekit-frontend/.tmp/ingest/parent-atlas-hypergraph.with-clusters.jsonl (5.73 MB, rows=8277)
- sveltekit-frontend/.tmp/ingest/parent-atlas-hypergraph.jsonl (5.73 MB, rows=8277)
- .tmp/ast-import-edges-resolved.jsonl (5.72 MB, rows=17463)
- sveltekit-frontend/.tmp/offline-analysis/module-cartridges.jsonl (3.45 MB, rows=5540)
- .tmp/atlas-cartridge-seeds.jsonl (2.67 MB, rows=4173)

## Largest MessagePack Chunks

- memory/packets/chunk-0013.msgpack (44.5 KB)
- memory/packets/chunk-0010.msgpack (43.6 KB)
- memory/packets/chunk-0017.msgpack (43.6 KB)
- memory/packets/chunk-0004.msgpack (43.3 KB)
- memory/packets/chunk-0003.msgpack (43.3 KB)
- memory/packets/chunk-0019.msgpack (42.8 KB)
- memory/packets/chunk-0011.msgpack (42.8 KB)
- memory/packets/chunk-0009.msgpack (42.7 KB)
- memory/packets/chunk-0005.msgpack (42.7 KB)
- memory/packets/chunk-0008.msgpack (42.5 KB)
- memory/packets/chunk-0022.msgpack (42.5 KB)
- memory/packets/chunk-0006.msgpack (42.5 KB)

## Service Availability

| service | configured | host | port | reachable | detail |
|---|---|---|---:|---|---|
| RabbitMQ | yes | localhost | 5672 | yes | TCP reachable in 4ms |
| NATS | yes | 127.0.0.1 | 4222 | yes | TCP reachable in 1ms |
| TurboVec | yes | 127.0.0.1 | 8791 | yes | disabled in opencode; MCP ok (4 tools); health ok (200) |

## Packet Counts

- packet rows (NDJSON + JSONL): 788925
- MessagePack files: 25
- packet-like files: 9952
- total packet-like bytes: 2.60 GB

## Node Parse Risk

- score: 100/100
- label: HIGH
- rationale: large-json-files-present, large-ndjson-jsonl-files-present, aggregate-text-footprint-high, packet-row-count-high

## Notes

- This audit is read-only.
- LEVEL_1_CPU_STREAMING is the default lane.
- LEVEL_2_BINARY_TRANSPORT is justified when RabbitMQ/NATS is reachable or binary contract pressure is visible.
- LEVEL_3_GPU_STRUCTURAL is reserved for multi-gigabyte artifacts or path-scan saturation.
- Do not build gRPC, FlatBuffers, CUDA JSONPath, or GpJSON from this audit alone.
