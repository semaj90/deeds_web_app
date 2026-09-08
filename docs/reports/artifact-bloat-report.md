# Artifact Bloat Audit

Generated: 2026-09-07T21:25:12.813Z

## Summary

- total files: 26763
- total size MB: 31098.24
- duplicate files: 1352

## By Kind
- raw_json: 22317
- ndjson: 443
- msgpack: 0
- duckdb: 5
- parquet: 12
- embedding_checkpoint: 65
- som_checkpoint: 8
- report: 2561
- duplicate: 1352

## Largest Files

| Path | Kind | Size (MB) | Recommendation |
|------|------|-----------|-----------------|
| `models/ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf` | embedding_checkpoint | 5656.9 | move_cold |
| `models/gemma4-legal-iq4xs-direct.gguf` | embedding_checkpoint | 4855.57 | move_cold |
| `models/gemma4-e2b-rotorquant-iq4xs/gemma-4-E2B-it-RotorQuant-IQ4_XS.gguf` | embedding_checkpoint | 3156.48 | move_cold |
| `models/embeddinggemma_300m/model.safetensors` | embedding_checkpoint | 1155.36 | move_cold |
| `models/mmproj-F16.gguf` | embedding_checkpoint | 944.49 | move_cold |
| `models/mmproj-Ornith-1.5-9B-BF16.gguf` | embedding_checkpoint | 879.01 | move_cold |
| `.tmp/mapreduce-full-v5.ndjson` | ndjson | 768.04 | compress_zstd |
| `sveltekit-frontend/tmp/codebase_chunks_768-embeddings.ndjson` | ndjson | 704.99 | keep_canonical |
| `models/embeddinggemma-300m-f16.gguf` | embedding_checkpoint | 593.06 | move_cold |
| `.tmp/backups/legal_ai_db_2026-07-03_18-06-35.sql` | raw_json | 537.6 | compress_zstd |
| `models/gemma3_270m/model.safetensors` | embedding_checkpoint | 511.38 | move_cold |
| `granite-docling-258M/model.safetensors` | embedding_checkpoint | 491.23 | move_cold |
| `models/gemma3-client-onnx/gemma3_270m_w8a16.onnx` | embedding_checkpoint | 417.22 | move_cold |
| `models/gemma3-client-onnx/gemma3_client_quantized.onnx` | embedding_checkpoint | 417.22 | move_cold |
| `.tmp/simd-adaptive-parser.json` | raw_json | 374.29 | compress_zstd |
| `sveltekit-frontend/tmp/hypergraph/codebase_chunks_768-embeddings.ndjson` | ndjson | 370.64 | keep_canonical |
| `models/embeddinggemma-300m-q8_0.gguf` | embedding_checkpoint | 318.14 | move_cold |
| `.tmp/atlas-gemma-rank-onnx/atlas_gemma_rank_v1_feasibility.onnx.data` | raw_json | 295.31 | compress_zstd |
| `.tmp/atlas-gemma-rank-onnx/probe_5tok.onnx.data` | raw_json | 295.13 | compress_zstd |
| `.tmp/atlas-gemma-rank-onnx/atlas_gemma_rank_v1_feasibility_1tok.onnx.data` | raw_json | 295.06 | compress_zstd |
| `.tmp/atlas-gemma-rank-onnx/probe_2tok.onnx.data` | raw_json | 295.06 | compress_zstd |
| `.tmp/atlas-gemma-rank-onnx/probe_3tok.onnx.data` | raw_json | 295.06 | compress_zstd |
| `.tmp/atlas-gemma-rank-onnx/probe_4tok.onnx.data` | raw_json | 295.06 | compress_zstd |
| `.tmp/atlas-gemma-rank-onnx/probe2_2tok.onnx.data` | raw_json | 295.06 | compress_zstd |
| `.tmp/atlas-gemma-rank-onnx/probe2_3tok.onnx.data` | raw_json | 295.06 | compress_zstd |

## Duplicate Groups

- 75a6583c1a41: models/atlas-gemma-rank-v1-donor-b/standalone-init-bf16/tokenizer.json, models/atlas-gemma-rank-v1/standalone-init-bf16/tokenizer.json, models/gemma4_assistant_huggingface_7_3_26/tokenizer.json, models/gemma4-e4b-qat-assistant-2026-07-20/tokenizer.json
- 0e0f2ce3de03: sveltekit-frontend/.tmp/offline-analysis/fe-graph-sveltekit-route-gap-atlas.json, sveltekit-frontend/docs/graph/sveltekit-route-gap-atlas.json
- ad93d182126d: sveltekit-frontend/.tmp/offline-analysis/fe-graph-sveltekit-route-map.json, sveltekit-frontend/docs/graph/sveltekit-route-map.json
- 5bcb0c7fd6d5: docs/graph/repo-sveltekit-route-atlas.json, sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-sveltekit-route-atlas.json
- 1299c11d7cf6: models/embeddinggemma_300m_onnx/tokenizer.model, models/embeddinggemma_300m/tokenizer.model, models/gemma3_270m/tokenizer.model, models/gemma3-client-onnx/tokenizer.model
- 6b44a0a82c06: .tmp/atlas/ordinal-bridge-source/candidate-ordinal-map-v1-5k-valid-readonly.json, .tmp/atlas/ordinal-bridge-source/candidate-ordinal-map-v1-rebuilt-readonly.json
- 0f05d3703832: sveltekit-frontend/.tmp/offline-analysis/fe-graph-enhanced-hypergraph.json, sveltekit-frontend/docs/graph/enhanced-hypergraph.json
- 506b34d1ae7d: .tmp/summary-envelopes.ndjson, sveltekit-frontend/.tmp/summary-envelopes.ndjson
- 360bc1b7a6d9: .tmp/repairs/unwrapped/tasks.json.report.json.items.jsonl, .tmp/repairs/unwrapped/tasks.json.report.json.items.jsonl.items.jsonl.tmp, .tmp/repairs/unwrapped/tasks.json.report.json.items.jsonl.tmp
- 7bb43d8a79a1: turbovec/target/release/_turbovec.dll, turbovec/target/release/deps/_turbovec.dll
- da9213875fd4: .tmp/repairs/unwrapped/svelte-errors.ndjson.report.json.items.jsonl, .tmp/repairs/unwrapped/svelte-errors.ndjson.report.json.items.jsonl.items.jsonl.tmp, .tmp/repairs/unwrapped/svelte-errors.ndjson.report.json.items.jsonl.tmp
- 24479813a1b6: models/embeddinggemma_300m_onnx/tokenizer_config.json, models/embeddinggemma_300m/tokenizer_config.json
- 94e8cea29ab0: .tmp/mapreduce-path-index.ndjson, .tmp/path-map.ndjson
- fea1d5e43f14: sveltekit-frontend/.tmp/offline-analysis/cluster-topology.json, sveltekit-frontend/.tmp/offline-analysis/fe-graph-cluster-topology.json
- b6c922fcefd6: turbovec/target/release/_turbovec.pdb, turbovec/target/release/deps/_turbovec.pdb
- f0b89d816903: .tmp/atlas-vector-snapshots/vector-snapshot-5k-turbovec-input.ndjson, .tmp/atlas-vector-snapshots/vector-snapshot-5k.ndjson
- a4c2229bdc2a: .tmp/langextract-1.6-probe/Lib/site-packages/numpy.libs/msvcp140-a4c2229bdc2a2a630acdc095b4d86008.dll, .tmp/langextract-1.6-probe/Lib/site-packages/pandas.libs/msvcp140-a4c2229bdc2a2a630acdc095b4d86008.dll
- dfe8728197fb: .tmp/repairs/tasks.json.bak, .tmp/repairs/tasks.json.wrap-backup.2026-05-31T07-23-45-169Z
- 8c3aeeb09478: .tmp/atlas/current-source-chunk-cohort-replay-a.ndjson, .tmp/atlas/current-source-chunk-cohort-replay-b.ndjson, .tmp/atlas/current-source-chunk-cohort-v1.ndjson
- 4eedfe3eaf31: sveltekit-frontend/.tmp/offline-analysis/fe-graph-hypergraph-clusters.json, sveltekit-frontend/.tmp/offline-analysis/hypergraph-clusters.json
- fdae2f1eecbd: .tmp/atlas/current-ast-symbol-resolution-v1.jsonl, .tmp/atlas/current-graph-symbol-resolution-v1.jsonl
- af4f5851e10c: .tmp/atlas/current-graphify-symbol-resolution-v1.jsonl, .tmp/atlas/graphify-file-index-v1/ast-symbol-resolution.jsonl
- bca60b034c78: .tmp/codebase-feature-map.json, docs/graph/codebase-feature-map.json
- 0fbf422d3617: .tmp/atlas-spectral-live-fixture-zero-duplicates/nodes.parquet, .tmp/atlas-spectral-live-fixture/nodes.parquet
- d1fda6bdfe8f: docs/graph/codebase-semantics-neo4j-report.json, sveltekit-frontend/.tmp/offline-analysis/docs-graph-codebase-semantics-neo4j-report.json
