# Artifact Bloat Audit

Generated: 2026-06-12T19:25:59.024Z

## Summary

- total files: 7781
- total size MB: 14974.92
- duplicate files: 463

## By Kind
- raw_json: 6578
- ndjson: 170
- msgpack: 0
- duckdb: 2
- parquet: 6
- embedding_checkpoint: 43
- som_checkpoint: 6
- report: 513
- duplicate: 463

## Largest Files

| Path | Kind | Size (MB) | Recommendation |
|------|------|-----------|-----------------|
| `models/gemma4-legal-iq4xs-direct.gguf` | embedding_checkpoint | 4855.57 | move_cold |
| `models/embeddinggemma_300m/model.safetensors` | embedding_checkpoint | 1155.36 | move_cold |
| `models/mmproj-F16.gguf` | embedding_checkpoint | 944.49 | move_cold |
| `.tmp/mapreduce-full-v5.ndjson` | ndjson | 768.04 | compress_zstd |
| `sveltekit-frontend/tmp/codebase_chunks_768-embeddings.ndjson` | ndjson | 704.99 | keep_canonical |
| `models/embeddinggemma-300m-f16.gguf` | embedding_checkpoint | 593.06 | move_cold |
| `models/gemma3_270m/model.safetensors` | embedding_checkpoint | 511.38 | move_cold |
| `granite-docling-258M/model.safetensors` | embedding_checkpoint | 491.23 | move_cold |
| `models/gemma3-client-onnx/gemma3_270m_w8a16.onnx` | embedding_checkpoint | 417.22 | move_cold |
| `models/gemma3-client-onnx/gemma3_client_quantized.onnx` | embedding_checkpoint | 417.22 | move_cold |
| `.tmp/simd-adaptive-parser.json` | raw_json | 374.29 | compress_zstd |
| `sveltekit-frontend/tmp/hypergraph/codebase_chunks_768-embeddings.ndjson` | ndjson | 370.64 | keep_canonical |
| `models/embeddinggemma-300m-q8_0.gguf` | embedding_checkpoint | 318.14 | move_cold |
| `models/embeddinggemma_300m_onnx/model.onnx` | embedding_checkpoint | 290.74 | move_cold |
| `.tmp/gpu-som-checkpoint/scroll_vectors.json` | som_checkpoint | 225.23 | move_cold |
| `docs/reports/ignored-directory-audit.json` | report | 152.62 | keep_canonical |
| `.tmp/gpu-som-checkpoint/scroll_meta.json` | som_checkpoint | 148.71 | move_cold |
| `docs/reports/ignored-directory-audit.min.json` | report | 133.45 | keep_canonical |
| `.tmp/mapreduce-full-v3.ndjson` | ndjson | 105.06 | compress_zstd |
| `.tmp/mapreduce-full-v2.ndjson` | ndjson | 104.88 | compress_zstd |
| `.tmp/mapreduce-full.ndjson` | ndjson | 104.58 | compress_zstd |
| `.tmp/ingest/csv/nodes.csv` | raw_json | 97.14 | compress_zstd |
| `.tmp/ingest/nodes.ndjson` | ndjson | 89.57 | compress_zstd |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-deep-import-graph.json` | raw_json | 56.93 | compress_zstd |
| `sveltekit-frontend/docs/graph/deep-import-graph.json` | raw_json | 56.93 | keep_canonical |

## Duplicate Groups

- 0e0f2ce3de03: sveltekit-frontend/.tmp/offline-analysis/fe-graph-sveltekit-route-gap-atlas.json, sveltekit-frontend/docs/graph/sveltekit-route-gap-atlas.json
- ad93d182126d: sveltekit-frontend/.tmp/offline-analysis/fe-graph-sveltekit-route-map.json, sveltekit-frontend/docs/graph/sveltekit-route-map.json
- 5bcb0c7fd6d5: docs/graph/repo-sveltekit-route-atlas.json, sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-sveltekit-route-atlas.json
- 711ff33e746a: sveltekit-frontend/.tmp/offline-analysis/fe-graph-nes-glyph-architecture.json, sveltekit-frontend/docs/graph/nes-glyph-architecture.json
- 832c3405615e: sveltekit-frontend/.tmp/offline-analysis/fe-graph-multihop-codebase-map.json, sveltekit-frontend/docs/graph/multihop-codebase-map.json
- 1299c11d7cf6: models/embeddinggemma_300m_onnx/tokenizer.model, models/embeddinggemma_300m/tokenizer.model, models/gemma3_270m/tokenizer.model, models/gemma3-client-onnx/tokenizer.model
- 0f05d3703832: sveltekit-frontend/.tmp/offline-analysis/fe-graph-enhanced-hypergraph.json, sveltekit-frontend/docs/graph/enhanced-hypergraph.json
- d986be77b3f8: docs/atlas/feature-registry.json, sveltekit-frontend/docs/atlas/feature-registry.json
- 360bc1b7a6d9: .tmp/repairs/unwrapped/tasks.json.report.json.items.jsonl, .tmp/repairs/unwrapped/tasks.json.report.json.items.jsonl.items.jsonl.tmp, .tmp/repairs/unwrapped/tasks.json.report.json.items.jsonl.tmp
- 7bb43d8a79a1: turbovec/target/release/_turbovec.dll, turbovec/target/release/deps/_turbovec.dll
- da9213875fd4: .tmp/repairs/unwrapped/svelte-errors.ndjson.report.json.items.jsonl, .tmp/repairs/unwrapped/svelte-errors.ndjson.report.json.items.jsonl.items.jsonl.tmp, .tmp/repairs/unwrapped/svelte-errors.ndjson.report.json.items.jsonl.tmp
- 24479813a1b6: models/embeddinggemma_300m_onnx/tokenizer_config.json, models/embeddinggemma_300m/tokenizer_config.json
- 94e8cea29ab0: .tmp/mapreduce-path-index.ndjson, .tmp/path-map.ndjson
- fea1d5e43f14: sveltekit-frontend/.tmp/offline-analysis/cluster-topology.json, sveltekit-frontend/.tmp/offline-analysis/fe-graph-cluster-topology.json
- b6c922fcefd6: turbovec/target/release/_turbovec.pdb, turbovec/target/release/deps/_turbovec.pdb
- dfe8728197fb: .tmp/repairs/tasks.json.bak, .tmp/repairs/tasks.json.wrap-backup.2026-05-31T07-23-45-169Z
- 4eedfe3eaf31: sveltekit-frontend/.tmp/offline-analysis/fe-graph-hypergraph-clusters.json, sveltekit-frontend/.tmp/offline-analysis/hypergraph-clusters.json
- 9845117af1f9: .tmp/kanban-board.json, sveltekit-frontend/.tmp/offline-analysis/docs-graph-kanban-board.json
- d1fda6bdfe8f: docs/graph/codebase-semantics-neo4j-report.json, sveltekit-frontend/.tmp/offline-analysis/docs-graph-codebase-semantics-neo4j-report.json
- 5b9f14c2540e: sveltekit-frontend/.tmp/offline-analysis/fe-graph-cluster-agents-index.json, sveltekit-frontend/docs/graph/cluster-agents-index.json
- 1645aa31dde7: .tmp/repairs/unwrapped/svelte5-patterns.jsonl.report.json.items.jsonl, .tmp/repairs/unwrapped/svelte5-patterns.jsonl.report.json.items.jsonl.items.jsonl.tmp, .tmp/repairs/unwrapped/svelte5-patterns.jsonl.report.json.items.jsonl.tmp
- 93b55c582b73: docs/graph/repo-env-map.json, sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-env-map.json
- 7d551539e57c: .tmp/repairs/svelte5-patterns.jsonl.backup.2026-05-31T07-19-38-881Z, .tmp/repairs/svelte5-patterns.jsonl.bak, .tmp/repairs/svelte5-patterns.jsonl.wrap-backup.2026-05-31T07-23-45-155Z
- f622fd8f06f5: .tmp/repairs/unwrapped/settings.json.report.json.items.jsonl, .tmp/repairs/unwrapped/settings.json.report.json.items.jsonl.items.jsonl.tmp, .tmp/repairs/unwrapped/settings.json.report.json.items.jsonl.tmp
- fe99c8a0a717: sveltekit-frontend/tmp/centroids-test.json, sveltekit-frontend/tmp/centroids.json
