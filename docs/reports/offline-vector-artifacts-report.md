# Offline Vector and Binary Artifacts Audit

**Generated**: 2026-06-11T22:37:04.700Z
**Total Files Audited**: 4160
**Total Size**: 8272.988 MB
**Gitignored Files**: 2233 / 4160

## Summary by Ingestion Lane

| Lane | File Count | Description |
|---|---|---|
| **Runtime-safe** | 3314 | Small manifests, packet metadata, and summary reports. Safe for active query pipelines. |
| **Cold / gitignored** | 802 | Large datasets (>100MB JSON), DuckDB database files, and Parquet/Arrow snapshots. |
| **GPU / TurboVec** | 44 | PyTorch models (.pt), SafeTensors weights, binary dumps, and vector checkpoints. |

## Recommended Actions Breakdown

| Action | Count | Strategy |
|---|---|---|
| `keep_runtime` | 3279 | Retain in active frontend workspace / hot cache. |
| `cold_archive` | 20 | Move/keep in cold lanes. Prevent active loading to guard VRAM/RAM. |
| `ldjson_batch` | 622 | Ingest as batch tasks without loading raw logs directly into memory. |
| `msgpack_ingest` | 35 | Process chunks via the Rust parser and upload structured metadata to Postgres. |
| `gpu_training_input` | 44 | Reserve for LibTorch/PyTorch model loops and SOM autoencoding loops. |
| `ignore_generated` | 160 | Exclude from core indexing (e.g. svelte-check dumps, transient logs). |

## Detailed Artifact Inventory

| Rel Path | Size (MB) | Type | Gitignored? | Lane | Action |
|---|---|---|---|---|---|
| `models/embeddinggemma_300m/model.safetensors` | 1155.363 | `safetensors_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `sveltekit-frontend/tmp/codebase_chunks_768-embeddings.ndjson` | 704.985 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `models/gemma3_270m/model.safetensors` | 511.382 | `safetensors_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `granite-docling-258M/model.safetensors` | 491.231 | `safetensors_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json` | 400.176 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `cold` | `cold_archive` |
| `.tmp/simd-adaptive-parser.json` | 374.288 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `cold_archive` |
| `sveltekit-frontend/tmp/hypergraph/codebase_chunks_768-embeddings.ndjson` | 370.644 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/gpu-som-checkpoint/scroll_vectors.json` | 225.229 | `binary_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `.rag-metrics/embeddings/embeddings.jsonl` | 206.098 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json` | 174.677 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `cold` | `cold_archive` |
| `scripts/court_data/coastalcph__lex_glue__train.jsonl` | 172.773 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `vendor/models/lora/gemma4-legal-grpo/adapter_model.safetensors` | 161.879 | `safetensors_weights` | ✅ Yes (rule: `vendor/`) | `gpu-turbovec` | `gpu_training_input` |
| `docs/reports/ignored-directory-audit.json` | 152.461 | `json_document` | ❌ No | `cold` | `cold_archive` |
| `.tmp/gpu-som-checkpoint/scroll_meta.json` | 148.713 | `json_document` | ❌ No | `cold` | `cold_archive` |
| `vendor/models/lora/gemma4-legal-text/adapter_model.safetensors` | 140.083 | `safetensors_weights` | ✅ Yes (rule: `vendor/`) | `gpu-turbovec` | `gpu_training_input` |
| `docs/reports/ignored-directory-audit.min.json` | 133.450 | `json_document` | ❌ No | `cold` | `cold_archive` |
| `docker/docling-vlm/models/yolov8x.pt` | 130.549 | `pytorch_model` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `.rag-metrics/chunks/ts.jsonl` | 124.479 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/mapreduce-full-v4.ndjson` | 110.151 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/mapreduce-full-v3.ndjson` | 105.055 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/mapreduce-full-v2.ndjson` | 104.879 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/mapreduce-full.ndjson` | 104.585 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/ingest/nodes.ndjson` | 89.571 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `scripts/court_data/coastalcph__lex_glue__test.jsonl` | 73.628 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/coastalcph__lex_glue__validation.jsonl` | 72.991 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-deep-import-graph.json` | 56.928 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/deep-import-graph.json` | 56.928 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-codebase-graph.json` | 49.519 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/kb/notecards/graph_file_cards.jsonl` | 44.570 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/cards/codebase-summary-card-edges.jsonl` | 36.473 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `models/embeddinggemma_300m_onnx/tokenizer.json` | 34.108 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/gemma3-client-onnx/tokenizer.json` | 34.107 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/calls-neo4j-dryrun.json` | 33.955 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/models/embeddinggemma_300m_onnx/tokenizer.json` | 31.838 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/gemma3_270m_onnx/tokenizer.json` | 31.838 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/embeddinggemma_300m_onnx/tokenizer.json` | 31.838 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/gemma3_270m/tokenizer.json` | 31.838 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m/tokenizer.json` | 31.838 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.rag-metrics/chunks/svelte.jsonl` | 28.805 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/graph/repo-root-atlas.json` | 28.473 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-root-atlas.json` | 28.470 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-sveltekit-route-gap-atlas.json` | 27.507 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/sveltekit-route-gap-atlas.json` | 27.507 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-sveltekit-route-map.json` | 27.481 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/sveltekit-route-map.json` | 27.481 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/calls-edges-clean.ndjson` | 25.747 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json` | 24.902 | `binary_weights` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `gpu-turbovec` | `gpu_training_input` |
| `sveltekit-frontend/memory/cards/codebase-summary-cards.jsonl` | 24.297 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `runtime-safe` | `keep_runtime` |
| `scripts/atlas/out/calls-edges-2026-05-29.ndjson` | 23.450 | `ndjson_dataset` | ✅ Yes (rule: `[Oo]ut/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs/graph/codebase-graph.json` | 20.308 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs/graph/codebase-graph.json`) | `runtime-safe` | `keep_runtime` |
| `next_steps/active/SCHEMA_MANIFEST.json` | 18.572 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/graphify/deep/deep-import-graph.json` | 18.351 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/graphify/deep/deep-import-edges.jsonl` | 17.129 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.rag-metrics/chunks/md.jsonl` | 16.150 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/calls-edges.jsonl` | 15.066 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/index/lexical-hits.jsonl` | 13.864 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/index/docs-map.jsonl` | 11.592 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/svelte-check-machine.ndjson` | 10.752 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `training-datasets/atlas-phase6.jsonl` | 9.539 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json` | 9.004 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `cold` | `ignore_generated` |
| `models/embeddinggemma_300m/3_Dense/model.safetensors` | 9.000 | `safetensors_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `models/embeddinggemma_300m/2_Dense/model.safetensors` | 9.000 | `safetensors_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `.rag-metrics/chunks/go.jsonl` | 8.799 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `duckdb/atlas.duckdb` | 8.590 | `duckdb_database` | ❌ No | `cold` | `cold_archive` |
| `.tmp/calls.jsonl` | 8.479 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/calls-unresolved.jsonl` | 8.444 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/graph/repo-sveltekit-route-atlas.json` | 8.071 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-sveltekit-route-atlas.json` | 8.071 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/deep/deep-import-graph.json` | 7.354 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/memory/graphify/deep/deep-import-graph.json`) | `runtime-safe` | `keep_runtime` |
| `granite-docling-258M/tokenizer.json` | 7.300 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/index/symbols.jsonl` | 7.253 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graphify/deep/deep-import-edges.jsonl` | 6.830 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-nes-glyph-architecture.json` | 6.808 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/nes-glyph-architecture.json` | 6.808 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scratch/index-checkpoints/directory-clusters.json` | 6.383 | `json_document` | ✅ Yes (rule: `scratch/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/atlas.duckdb` | 6.262 | `duckdb_database` | ❌ No | `cold` | `cold_archive` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json` | 6.005 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `docs/reports/neschrom97-card-registry.json` | 5.976 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-codebase-graph.json` | 5.964 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/ingest/parent-atlas-hypergraph.with-clusters.jsonl` | 5.733 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/ingest/parent-atlas-hypergraph.jsonl` | 5.732 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/ast-import-edges-resolved.jsonl` | 5.719 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-multihop-codebase-map.json` | 5.703 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/multihop-codebase-map.json` | 5.703 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/codebase-graph.json` | 5.361 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-output.json` | 5.154 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/reports/deep-audit/d9-shallow-dynamic-triage.json` | 4.741 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/chunks/feature-chunks.ndjson` | 4.725 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/parent_atlas_gpu.ndjson` | 4.400 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/graph/kanban-board.json` | 4.359 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/error-top200.json` | 4.073 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/index/feature-map.jsonl` | 4.015 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/errors-original.jsonl` | 3.892 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/error-top100.json` | 3.827 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `docs/reports/neschrom97-card-taxonomy.json` | 3.787 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ast-neo4j-dryrun.json` | 3.575 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/offline-synthesis/hidden-packet-pathmap.ndjson` | 3.556 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/packets.duckdb` | 3.512 | `duckdb_database` | ❌ No | `cold` | `cold_archive` |
| `sveltekit-frontend/.tmp/offline-analysis/module-cartridges.jsonl` | 3.452 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/codebase/module-cartridges.jsonl` | 3.452 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs/graph/deep-audit-ast.json` | 3.414 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-deep-audit-ast.json` | 3.361 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/kb/cards/codebase_graph_cards.rank.json` | 3.188 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/parent_atlas.parquet` | 3.153 | `parquet_snapshot` | ❌ No | `cold` | `cold_archive` |
| `sveltekit-frontend/.tmp/mega-audit/chunk2-report.json` | 3.145 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/drizzle-temporal-audit.latest.json` | 3.114 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `memory/exports/parent-atlas/parent_atlas_index.json` | 3.040 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-enhanced-hypergraph.json` | 2.963 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/enhanced-hypergraph.json` | 2.963 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/mega-audit/route-schema-test-map.json` | 2.918 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/kb/notecards/embedding_jobs.jsonl` | 2.775 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `.tmp/atlas-cartridge-seeds.jsonl` | 2.665 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ast-call-edges.jsonl` | 2.627 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graphify/gds/latest.json` | 2.615 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/de92f1995482.json` | 2.615 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/9f88ba87130f.json` | 2.615 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/87ce8522450e.json` | 2.615 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/79718ea5b812.json` | 2.615 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/39dea0098dd2.json` | 2.615 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/2539fec52b3e.json` | 2.615 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/agentic-rag-context.json` | 2.600 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/fe5bac8318f4.json` | 2.588 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/atlas/feature-registry.json` | 2.556 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/atlas/feature-registry.json` | 2.556 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/svelte-server-errors.json` | 2.535 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/extracted-patterns/svelte5-runes-extracted.jsonl` | 2.441 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/svelte5-runes-extracted.jsonl` | 2.441 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `docs/reports/directory-topology-map.json` | 2.374 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tmp/hypergraph-assignments.ndjson` | 2.286 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/datasets/llm_synthesis/2026-05-21.jsonl` | 2.285 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/offline-synthesis-mapreduce.duckdb` | 2.262 | `duckdb_database` | ❌ No | `cold` | `cold_archive` |
| `sveltekit-frontend/memory/kb/cards/codebase_graph_cards.jsonl` | 2.216 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/kb/notecards/graph_file_cards.invalid.jsonl` | 2.207 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graphify/gds/d73022fb38b0.json` | 2.085 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/327d93a38edc.json` | 2.085 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/parent-atlas-packets.ndjson` | 2.082 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `msgpack_ingest` |
| `sveltekit-frontend/memory/graphify/gds/ee345bc88602.json` | 2.063 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tmp/hypergraph-centroids.json` | 2.055 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/.svelte-check-output.json` | 2.018 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/tmp/hypergraph/codebase_chunks_768-assignments.ndjson` | 2.017 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/tmp/hypergraph/codebase_chunks_768-centroids.json` | 1.988 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ast-import-edges.jsonl` | 1.865 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/tasks.json.report.json` | 1.826 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/kanban_tasks.jsonl` | 1.817 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/atlas-component-profiles.jsonl` | 1.777 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/feature_labels.jsonl` | 1.770 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `scripts/memory/graphify/gds/latest.json` | 1.647 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/memory/graphify/gds/adb7a6419a31.json` | 1.647 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/memory/graphify/gds/98714cf0f2af.json` | 1.647 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/memory/graphify/gds/5cabb44eb71f.json` | 1.647 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/ca83f1ee2172.json` | 1.647 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/9eb06b3d359a.json` | 1.647 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/9b37a6ddcc25.json` | 1.647 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/85d87aee68bb.json` | 1.647 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/326a98796ade.json` | 1.647 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/e3d67ac668d6.json` | 1.641 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/dd928f2156f3.json` | 1.641 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/957855658f35.json` | 1.641 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/7af6afddf363.json` | 1.641 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/542fe2d6d605.json` | 1.616 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/deep/unresolved-imports.json` | 1.611 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/calls-graph-summary.json` | 1.586 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/knowledge/index-gap-memory-cards.embeds.jsonl` | 1.566 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/knowledge/document-knowledge-embeds.jsonl` | 1.566 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/knowledge/index-gap-memory-cards.qdrant-preview.jsonl` | 1.559 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/knowledge/document-knowledge-qdrant-preview.jsonl` | 1.559 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `granite-docling-258M/vocab.json` | 1.538 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-clusters.json` | 1.533 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `cold` | `ignore_generated` |
| `docs/reports/hidden-packet-pathmap.duckdb` | 1.512 | `duckdb_database` | ❌ No | `cold` | `cold_archive` |
| `.tmp/source-ref-repair-candidates.ndjson` | 1.496 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/unwrapped/tasks.json.report.json.items.jsonl` | 1.467 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-05-10.jsonl` | 1.446 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graphify/gds/a49488bdffd9.json` | 1.424 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/e168de463143.json` | 1.423 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/f6acb97e3829.json` | 1.422 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/dc26a2b48f57.json` | 1.422 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/8c1964af195a.json` | 1.422 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/38524f9dac39.json` | 1.422 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/c2162888ad70.json` | 1.421 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/b504fdae37e8.json` | 1.421 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/6b9b87d56cb4.json` | 1.421 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/4e76806822b7.json` | 1.421 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/dc4dede6380c.json` | 1.420 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/54351abfb865.json` | 1.420 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/svelte-errors.ndjson.report.json` | 1.407 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/superseded-score-candidates.json` | 1.387 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `memory/exports/som-topology-report.json` | 1.383 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/fetch_report_20260324_155845.json` | 1.285 | `json_document` | ✅ Yes (rule: `scripts/court_data/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/feature-card.duckdb` | 1.262 | `duckdb_database` | ❌ No | `cold` | `cold_archive` |
| `.tmp/analysis/backfill-proposals.ndjson` | 1.261 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `memory/exports/som-metrics.json` | 1.257 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/module-cartridges.idx.json` | 1.256 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/codebase/module-cartridges.idx.json` | 1.256 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/memory/graphify/gds/7c2d269cb33c.json` | 1.253 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/memory/graphify/gds/76047e144058.json` | 1.253 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/svelte-errors.ndjson.report.json.items.jsonl` | 1.249 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/hidden_directory_tasks.jsonl` | 1.232 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/reports/deep-audit/d9-orphan-verification.json` | 1.231 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/index-gap-memory-report.json` | 1.209 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/gpu-som-checkpoint/som_8x8_n76878.json` | 1.205 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/atlas/out/synthetic-traces.ndjson` | 1.205 | `ndjson_dataset` | ✅ Yes (rule: `[Oo]ut/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/offline-analysis/module-cartridges.min.json` | 1.173 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/codebase/module-cartridges.min.json` | 1.173 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ast-file-nodes.jsonl` | 1.161 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/index/protocol-detections.jsonl` | 1.153 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/static/models/embeddinggemma_300m_onnx/tokenizer_config.json` | 1.151 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/embeddinggemma_300m_onnx/tokenizer_config.json` | 1.151 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/gemma3_270m/tokenizer_config.json` | 1.151 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m_onnx/tokenizer_config.json` | 1.151 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m/tokenizer_config.json` | 1.151 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-05-11.jsonl` | 1.136 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/llm-wiki-chunks/_combined.ndjson` | 1.110 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/static/gemma3_270m_onnx/tokenizer_config.json` | 1.102 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/gemma3-client-onnx/tokenizer_config.json` | 1.102 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/som_training_pairs.jsonl` | 1.098 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte5-compliance-report.json` | 1.084 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-cluster-topology.json` | 1.071 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/cluster-topology.json` | 1.071 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/cluster-topology.json` | 1.071 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/index/route-service-relations.jsonl` | 1.045 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graph/deep-node-relations.jsonl` | 1.040 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `.tmp/kanban_tasks.jsonl` | 1.038 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/turbovec/mega-audit-2026-05-21.jsonl` | 1.026 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/edges/som_edge_edges.ndjson` | 1.001 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/superseded-score-candidates.ndjson` | 1.000 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/gpu-som-checkpoint/ae_weights_768_64.json` | 0.978 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/path-map.json` | 0.971 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/mapreduce-test.ndjson` | 0.959 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-06-11T03-27-27/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-51/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-43/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-19-54/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-18-43/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-13/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-06/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-35-01/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-33-59/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-17-33/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-15-45/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-07-17/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-05-46/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-00-23/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-59-03/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-47-57/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-46-36/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-40-05/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-38-52/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-15-48/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-14-58/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-11-06/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-09-19/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-17-36/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-16-15/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-01-53/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-00-27/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-26/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-09-00/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-07-15/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-24-30/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-23-31/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-18-05/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-17-08/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-00-02/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T20-59-02/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-37-24/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-36-07/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-17-52/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-16-53/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-06-54/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-05-28/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-33-50/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-30-24/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-24-07/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-19-55/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-15-49/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-14-54/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-49/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-02/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-15-45/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-14-59/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-10-45/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-09-56/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-05-17/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-04-24/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-59-44/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-58-52/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-54-38/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-53-53/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-05-51/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-45-53/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-44-23/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-43-52/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-40-55/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-28-36/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-27-34/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-24-39/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-22-43/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-57/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-05/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-45-13/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-44-19/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-31-18/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-30-23/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-25-25/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-23-56/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-58/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-07/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-57/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-02/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-42-53/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-54/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-01/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-39-25/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-34-44/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-33-51/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-30-37/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-29-33/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-27-03/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-26-59/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-59/qdrant_cluster_tags.json` | 0.956 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/opencode-bootstrap.json` | 0.953 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/package-lock.json` | 0.933 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-dict-full.json` | 0.926 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/mega-audit/chunk3-storage-memory-integrity.json` | 0.899 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-token-map.jsonl` | 0.873 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/drizzle/meta/0035_snapshot.json` | 0.848 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/drizzle-introspect-v2/meta/0000_snapshot.json` | 0.846 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0034_snapshot.json` | 0.846 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0033_snapshot.json` | 0.845 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0032_snapshot.json` | 0.842 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0031_snapshot.json` | 0.840 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/drizzle-introspect/meta/0000_snapshot.json` | 0.835 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/lanes/card.ndjson` | 0.834 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs/atlas-index/codebase-atlas.json` | 0.810 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0030_snapshot.json` | 0.804 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/training-datasets/case-summaries.jsonl` | 0.801 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/drizzle/meta/0028_snapshot.json` | 0.794 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-47-36/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-44-14/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-40-45/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-39-46/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-31/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-11/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-07-10/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-56/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-06/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-13-19/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-11-51/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-09-00/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-08-31/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-07-29/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-06-18/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-02-09/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-01-36/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-56-22/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-55-50/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T14-55-56/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-42-15/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-41-43/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-49/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-17/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-08-12/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-07-52/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-05-35/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-04-38/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-56-03/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-48-10/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-47-46/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-29/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-11-51/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-03-59/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-24/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-09/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-46-33/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-39/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-40-07/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-33/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-33-38/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-22-48/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-08-08/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-21-48/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-06-12/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-19-09/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-05-54/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-18-50/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/qdrant_cluster_tags.json` | 0.792 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/feature_labels.jsonl` | 0.782 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/identity-catalog.jsonl` | 0.779 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/drizzle/meta/0027_snapshot.json` | 0.776 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/error-analysis-report.json` | 0.776 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0029_snapshot.json` | 0.773 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0026_snapshot.json` | 0.773 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0025_snapshot.json` | 0.772 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0024_snapshot.json` | 0.772 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0023_snapshot.json` | 0.757 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0022_snapshot.json` | 0.755 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0021_snapshot.json` | 0.748 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/graph_nodes.json` | 0.746 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/graph_nodes.json` | 0.746 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/graph_nodes.json` | 0.746 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0020_snapshot.json` | 0.745 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/colon-syntax-corruption-report.json` | 0.744 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-11-51/graph_nodes.json` | 0.743 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-03-59/graph_nodes.json` | 0.743 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-46-33/graph_nodes.json` | 0.743 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0019_snapshot.json` | 0.742 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `simd-bridge/cpp/build-x64-cuda-cuvs/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CUDA.bin` | 0.739 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-x64-cuda/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CUDA.bin` | 0.739 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-x64-cuda-cuvs/CMakeFiles/CheckCUDA/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CUDA.bin` | 0.738 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-x64-cuda-cublas/CMakeFiles/CheckCUDA/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CUDA.bin` | 0.738 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-x64-cuda-cublas/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CUDA.bin` | 0.738 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CheckCUDA/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CUDA.bin` | 0.738 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-verify-2026-05-31T08-06-57-567Z/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CUDA.bin` | 0.738 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `.tmp/path-map.ndjson` | 0.734 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-06-11T03-27-27/graph_nodes.json` | 0.727 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/graph_nodes.json` | 0.727 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-59/graph_nodes.json` | 0.727 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-51/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-43/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-19-54/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-18-43/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-13/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-06/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-35-01/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-33-59/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-17-33/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-15-45/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-07-17/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-05-46/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-00-23/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-59-03/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-47-57/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-46-36/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-40-05/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-38-52/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-15-48/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-14-58/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-11-06/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-09-19/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-17-36/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-16-15/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-01-53/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-00-27/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-26/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-09-00/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-07-15/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-24-30/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-23-31/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-18-05/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-17-08/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-00-02/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T20-59-02/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-37-24/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-36-07/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-17-52/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-16-53/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-06-54/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-05-28/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-33-50/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-30-24/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-24-07/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-19-55/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-15-49/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-14-54/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-49/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-02/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-15-45/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-14-59/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-10-45/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-09-56/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-05-17/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-04-24/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-59-44/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-58-52/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-54-38/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-53-53/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-05-51/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-45-53/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-44-23/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-43-52/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-40-55/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-28-36/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-27-34/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-24-39/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-22-43/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-57/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-05/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-45-13/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-44-19/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-31-18/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-30-23/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-25-25/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-23-56/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-58/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-07/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-57/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-02/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-42-53/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-54/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-01/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-39-25/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-34-44/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-33-51/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-30-37/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-29-33/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-27-03/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-26-59/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/graph_nodes.json` | 0.724 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/claude-mem-export.json` | 0.721 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/kanban_tasks.jsonl` | 0.703 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/drizzle/meta/0018_snapshot.json` | 0.686 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T01-05-54/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-00-48/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-08/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-02/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-14-40/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-46/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-18/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-06/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-03/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-07-59/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-30/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-05/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-59-42/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-53-22/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-52-31/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-34/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-24/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-45-52/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-33-56/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-20/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-15/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-26-55/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-24-29/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-04/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-01/qdrant_cluster_tags.json` | 0.685 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scratch/index-checkpoints/directory-clusters.bak.json` | 0.683 | `json_document` | ✅ Yes (rule: `scratch/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-47-36/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-44-14/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-40-45/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-39-46/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-31/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-11/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-07-10/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-56/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-06/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-13-19/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-11-51/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-09-00/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-08-31/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-07-29/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-06-18/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-02-09/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-01-36/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-56-22/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-55-50/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T14-55-56/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-42-15/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-41-43/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-49/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-17/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-08-12/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-07-52/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-05-35/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-04-38/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-56-03/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-48-10/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-47-46/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-29/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-24/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-09/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-39/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-40-07/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-33/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-33-38/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-22-48/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-08-08/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-21-48/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-06-12/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-19-09/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-05-54/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-18-50/graph_nodes.json` | 0.680 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/phase100/file-consolidation-audit.json` | 0.664 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `memory/datasets/llm_synthesis/2026-05-29.jsonl` | 0.648 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `scripts/memory/graphify/gds/0c8dde4166f9.json` | 0.639 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/14c35609db5f.json` | 0.639 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/086e3f967bcd.json` | 0.639 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/041ae486d091.json` | 0.639 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/GEMMA3-LEGAL-MEGA-TRAINING.jsonl` | 0.619 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `docs/atlas/cluster-cards.json` | 0.593 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/feature_labels.jsonl` | 0.593 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/GEMMA3-LEGAL-TRAINING-FINAL.jsonl` | 0.568 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/atlas/codebase-atlas.dirs.json` | 0.566 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-06-01.jsonl` | 0.547 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/drizzle/meta/0017_snapshot.json` | 0.545 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/vector64-preview.jsonl` | 0.539 | `binary_weights` | ✅ Yes (rule: `.tmp/`) | `gpu-turbovec` | `gpu_training_input` |
| `sveltekit-frontend/drizzle/meta/0016_snapshot.json` | 0.527 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/qlora_examples.jsonl` | 0.516 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/phase42-ast-report.json` | 0.516 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-06-03.jsonl` | 0.503 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/gpu-som-checkpoint/kmeans_k20_n76878.json` | 0.492 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/sourceRef-cardId-map.json` | 0.463 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/phase72/route-ast-graph.json` | 0.462 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-06-07.jsonl` | 0.459 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/runs/claude-code/2026-06-10.jsonl` | 0.456 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/drizzle/introspected/meta/0000_snapshot.json` | 0.437 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/unreachable-classified.json` | 0.434 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/ingest/atlas-data-files.jsonl` | 0.433 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/ast-tool-edges.jsonl` | 0.429 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graphify/gds/8570190e62e4.json` | 0.424 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/94f7dad3dee5.json` | 0.422 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/efd6de0df4d2.json` | 0.421 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/ed26cce257ae.json` | 0.414 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/e74733be87b4.json` | 0.414 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/d9fdec2d2deb.json` | 0.414 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/d961b59dcd90.json` | 0.414 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/d72dcf1b2ceb.json` | 0.414 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/abaca36cec90.json` | 0.414 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/8b7fbbf395fa.json` | 0.414 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/8557a442528e.json` | 0.414 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/5b96d34bdff1.json` | 0.414 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/40bc4e39a88b.json` | 0.414 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/3a5ec6a5133e.json` | 0.414 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/01c01e55ff2c.json` | 0.414 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/e1227339cfe6.json` | 0.412 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/bd3d74509c37.json` | 0.412 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/b9d2d67d877b.json` | 0.412 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/9cf78db2f1b1.json` | 0.412 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/6b2b25102225.json` | 0.412 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/178adb01602f.json` | 0.412 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-06-04.jsonl` | 0.411 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/drizzle-postgres-contract-report.json` | 0.410 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/fictional_cases.jsonl` | 0.408 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `.tmp/atlas-dict.json` | 0.403 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/fetch_report_20260324_154908.json` | 0.401 | `json_document` | ✅ Yes (rule: `scripts/court_data/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/atlas-index/codebase-atlas.min.json` | 0.399 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/fl_constitution.jsonl` | 0.399 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/atlas/codebase-atlas.min.json` | 0.399 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/claude-mem-export-rem.json` | 0.394 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-05-17.jsonl` | 0.390 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/runs/claude-code/2026-06-02.jsonl` | 0.388 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/compressed-packets.ndjson` | 0.386 | `ndjson_dataset` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `package-lock.json` | 0.386 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/parent_atlas_gpu.parquet` | 0.383 | `parquet_snapshot` | ❌ No | `cold` | `cold_archive` |
| `sveltekit-frontend/memory/runs/2026-05-07T01-05-54/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-00-48/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-08/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-02/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-14-40/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-46/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-18/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-06/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-03/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-07-59/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-30/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-05/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-59-42/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-53-22/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-52-31/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-34/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-24/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-45-52/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-33-56/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-20/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-15/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-26-55/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-24-29/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-04/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-01/graph_nodes.json` | 0.379 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-05-18.jsonl` | 0.377 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/parent_atlas_full.parquet` | 0.371 | `parquet_snapshot` | ❌ No | `cold` | `cold_archive` |
| `memory/exports/sourceRef-performance.json` | 0.361 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/model-inventory.json` | 0.360 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/ast-scan-report.json` | 0.359 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-06T06-27-46/report.json` | 0.357 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `memory/exports/cluster-cards.jsonl` | 0.350 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/runs/claude-code/2026-06-08.jsonl` | 0.348 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/runs/claude-code/2026-05-30.jsonl` | 0.333 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/chr97-eval-bouts.ndjson` | 0.331 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/datasets/llm_synthesis/2026-05-20.jsonl` | 0.326 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/errors-machine-latest.json` | 0.318 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/ma_constitution.jsonl` | 0.317 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `.tmp/retrieval-ranking-report.json` | 0.309 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tmp/embeddings-smoke.ndjson` | 0.307 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/sveltekit-frontend/tmp/embeddings-smoke.ndjson` | 0.307 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/tmp/chunks/parents-corpus-4d.ndjson` | 0.302 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/offline-analysis/hypergraph-clusters.json` | 0.299 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-hypergraph-clusters.json` | 0.299 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tmp/chunks/parents-corpus-expanded.ndjson` | 0.298 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/nv_constitution.jsonl` | 0.297 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-31_1a577c89d3.json` | 0.294 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/phase77-master-dataset.jsonl` | 0.294 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/complete-training-dataset.jsonl` | 0.294 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/tmp/chunks/parents-corpus-rg.ndjson` | 0.293 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/missing-features-review-latest.json` | 0.290 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0010_snapshot.json` | 0.290 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/original-superseded-score-2026-06-02.json` | 0.283 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-05-31.jsonl` | 0.282 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-30_83fecef3f4.json` | 0.281 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-06-01_4a069807ce.json` | 0.280 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/d9-vs-next-steps.json` | 0.280 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-06-06.jsonl` | 0.275 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/MASTER-TRAINING-COMPLETE.jsonl` | 0.274 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `memory/runs/claude-code/2026-06-09.jsonl` | 0.273 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/drizzle/meta/0009_snapshot.json` | 0.272 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/packets/atlas-graph-edges.jsonl` | 0.269 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/drizzle/meta/0008_snapshot.json` | 0.267 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0007_snapshot.json` | 0.265 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-05-29.jsonl` | 0.264 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/error-log.json` | 0.262 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/cards/top-100-codebase-summary-cards.json` | 0.262 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0006_snapshot.json` | 0.260 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-29_ffd3680ece.json` | 0.256 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/errors-machine.json` | 0.254 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `scripts/graph-data-500.json` | 0.253 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/errors-current.json` | 0.252 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/errors-after-fix1.json` | 0.249 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/GEMMA3-LEGAL-TRAINING-COMPLETE.jsonl` | 0.249 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/neo4j-context-graph.json` | 0.248 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-05-19.jsonl` | 0.246 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.venv_turbovec/Lib/site-packages/turbovec-0.3.0.dist-info/sboms/turbovec-python.cyclonedx.json` | 0.242 | `json_document` | ✅ Yes (rule: `*`) | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-05-16.jsonl` | 0.239 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-27_d1d3ba115c.json` | 0.238 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0005_snapshot.json` | 0.236 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/repo-dirty-tree-classification-2026-06-01.json` | 0.234 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/errors-latest.json` | 0.230 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/component-migration-report.json` | 0.226 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-06-11.jsonl` | 0.224 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/llm-wiki-chunks/som-clustering-rg.ndjson` | 0.215 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/import-graph-report.json` | 0.215 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-14/agents_scope_map.json` | 0.215 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-03-16/agents_scope_map.json` | 0.215 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `docs/reports/drizzle-audit-current.json` | 0.212 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `docs/reports/drizzle-audit-cleaned.json` | 0.212 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/docs/graph/hypergraph-clusters.json` | 0.210 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-23_807fd76157.json` | 0.208 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-19_508fb89a55.json` | 0.208 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/f794533a7a71.json` | 0.208 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/2affdd459b8e.json` | 0.208 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/02b644bb2cbe.json` | 0.208 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-22_807fd76157.json` | 0.207 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/memory/graphify/gds/5565949d4470.json` | 0.207 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/f93708cf6de5.json` | 0.207 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/atlas/out/tool-usage-edges.ndjson` | 0.206 | `ndjson_dataset` | ✅ Yes (rule: `[Oo]ut/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/unknown-queue.json` | 0.199 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/tool-usage-edges.ndjson` | 0.199 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graphify/gds/e36c8ba8db56.json` | 0.198 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/doc-feature-crosswalk-2026-06-01.json` | 0.196 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/api-cleanup/reports/cleanup-report.json` | 0.196 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-17_36d6efd6fd.json` | 0.195 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-16_e3bd5bc6b3.json` | 0.195 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0000_snapshot.json` | 0.195 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/retrieval/outcomes.jsonl` | 0.194 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/drizzle/meta/0004_snapshot.json` | 0.194 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graph/topology-ontology-clusters.json` | 0.194 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0003_snapshot.json` | 0.192 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0002_snapshot.json` | 0.192 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta/0001_snapshot.json` | 0.192 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/deep/test-coverage-links.json` | 0.191 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/phase103.1-scan-results.json` | 0.189 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-15_58af197b2e.json` | 0.186 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/knowledge/index-gap-memory-cards.jsonl` | 0.184 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-26_c91edcc108.json` | 0.177 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-24_a3d60be8ec.json` | 0.176 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-18_6901a9fba1.json` | 0.175 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-20_b4b492fd29.json` | 0.173 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/codebase-semantics-neo4j-report.json` | 0.170 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-05-09.jsonl` | 0.168 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/datasets/llm_synthesis/2026-05-17.jsonl` | 0.168 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/nj_constitution.jsonl` | 0.168 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-codebase-feature-map.json` | 0.167 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/ed4cf7c25df8.json` | 0.167 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/bac1734cc66a.json` | 0.167 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/ac01f510ec4f.json` | 0.167 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/a7a9a8f31f31.json` | 0.167 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/33e052c45de2.json` | 0.167 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/11dc991dae4c.json` | 0.167 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/e331348798d3.json` | 0.166 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/9fe51817f1b7.json` | 0.166 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/deep/route-dependency-map.json` | 0.163 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ast-db-edges.jsonl` | 0.162 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/typescript-enhanced.jsonl` | 0.162 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `.tmp/atlas-retrieval-loop.jsonl` | 0.161 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/kanban-board.json` | 0.160 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-kanban-board.json` | 0.160 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `docs/graph/codebase-semantics-neo4j-report.json` | 0.159 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/package.json` | 0.159 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-codebase-semantics-neo4j-report.json` | 0.159 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/edges_all.parquet` | 0.158 | `parquet_snapshot` | ❌ No | `cold` | `cold_archive` |
| `sveltekit-frontend/drizzle/meta_backup_20260101/0011_snapshot.json` | 0.155 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/sourceRef-parent-join-packets.jsonl` | 0.154 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `msgpack_ingest` |
| `tmp/llm-wiki-chunks/retrieval-augmented-generation-rg.ndjson` | 0.154 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `scripts/training-datasets/statute-analysis.jsonl` | 0.153 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/drizzle/meta_backup_20260101/0010_snapshot.json` | 0.152 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `tmp/llm-wiki-chunks/embedding-vectors-rg.ndjson` | 0.150 | `binary_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `memory/graph/deep-node-relations.jsonl` | 0.149 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `training-datasets/chr97-grpo-pairs-latest.jsonl` | 0.148 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `training-datasets/chr97-grpo-pairs-2026-05-31T08-58-12-096Z.jsonl` | 0.148 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/llm-wiki-chunks/graph-rag-rg.ndjson` | 0.140 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/runs/claude-code/2026-05-28.jsonl` | 0.139 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/kanban-turbovec-consolidation-latest.json` | 0.136 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-05-27.jsonl` | 0.136 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graphify/gds/137ce0cd0ab1.json` | 0.134 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/12869992bd6b.json` | 0.134 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/atlas/out/tool-usage-graph-summary.json` | 0.133 | `json_document` | ✅ Yes (rule: `[Oo]ut/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.eslint-cache.json` | 0.132 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-cluster-agents-index.json` | 0.131 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/cluster-agents-index.json` | 0.131 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/sourceRef-parent-join-archive-move-list.json` | 0.128 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/training-datasets/legal-qa-pairs.jsonl` | 0.126 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `.tmp/ingest/fixes.ndjson` | 0.120 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/kanban-tasks.jsonl` | 0.115 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-css-props-fix-report.json` | 0.114 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/qdrant-source-refs-backfill-latest.json` | 0.111 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/feature-lineage-report.json` | 0.111 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/drizzle-audit-current-utf8.json` | 0.109 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `docs/reports/drizzle-audit-cleaned-utf8.json` | 0.109 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/.tmp/missing_feature_todos.jsonl` | 0.109 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/advanced-fullstack-combined.jsonl` | 0.108 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/object-property-semicolons-report.json` | 0.108 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/47eb8089897b.json` | 0.107 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/analysis_reports/legal_concepts_20260324_153621.json` | 0.107 | `json_document` | ✅ Yes (rule: `scripts/analysis_reports/`) | `runtime-safe` | `keep_runtime` |
| `memory/packets/atlas-packet-facts.jsonl` | 0.104 | `jsonl_dataset` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `sveltekit-frontend/docs/reports/feature-card-semantics-report.json` | 0.104 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/atlas/out/cache-usage-edges.ndjson` | 0.104 | `ndjson_dataset` | ✅ Yes (rule: `[Oo]ut/`) | `cold` | `ldjson_batch` |
| `.tmp/offline-synthesis/consolidated-index.ndjson` | 0.103 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `memory/knowledge/document-knowledge-packets.jsonl` | 0.103 | `jsonl_dataset` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `.tmp/ingest/chr97-sprites.ndjson` | 0.100 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/llm-wiki-chunks/backpropagation-rg.ndjson` | 0.097 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/test-results/e2e-results.json` | 0.096 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta_backup_20260101/20250806060015_snapshot.json` | 0.096 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/cuvs-benchmark-smoke-latest.json` | 0.095 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/parent-atlas-overlay-crosswalk-report.json` | 0.093 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/fb23ebb6b637.json` | 0.093 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/761535c90ab0.json` | 0.093 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/4ecf9359f755.json` | 0.093 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/3c4136ca52ec.json` | 0.093 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/phase16-runtime-artifact-locator.json` | 0.092 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/parent-atlas-feature-command-atlas.json` | 0.089 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/rg-dumps/rg-dump-packets.ndjson` | 0.088 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `msgpack_ingest` |
| `memory/datasets/llm_synthesis/2026-06-07.jsonl` | 0.088 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/drizzle/meta_backup_20260101/20250804034836_snapshot.json` | 0.088 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta_backup_20260101/20250804023309_snapshot.json` | 0.088 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/startup-truth.json` | 0.087 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/svelte5-patterns.jsonl.report.json` | 0.085 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `tmp/llm-wiki-chunks/quantization-rg.ndjson` | 0.085 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/reports/deep-audit/wiki-audit-enrichment.json` | 0.085 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/combined_training_data.jsonl` | 0.085 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/multilang-patterns.jsonl` | 0.085 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `memory/knowledge/document-knowledge-edges.jsonl` | 0.084 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graphify/gds/95d2130cbb9e.json` | 0.083 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/1d62a0995472.json` | 0.083 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/atlas/out/db-usage-edges.ndjson` | 0.082 | `ndjson_dataset` | ✅ Yes (rule: `[Oo]ut/`) | `cold` | `ldjson_batch` |
| `memory/datasets/llm_synthesis/2026-05-22.jsonl` | 0.081 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/contextual-tree-readiness-report.json` | 0.080 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/packets/lora-training-pairs-contrastive.jsonl` | 0.079 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/offline-analysis/db-usage-edges.ndjson` | 0.079 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `scripts/tests/screenshots/2026-04-17T04-19-14/report.json` | 0.079 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/domain-topology.json` | 0.078 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/packets/session-features.ndjson` | 0.078 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/datasets/llm_synthesis/2026-05-26.jsonl` | 0.076 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/repairs/unwrapped/svelte5-patterns.jsonl.report.json.items.jsonl` | 0.075 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `tmp/llm-wiki-chunks/kv-cache-rg.ndjson` | 0.074 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/datasets/llm_synthesis/2026-05-23.jsonl` | 0.073 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/lanes/env.ndjson` | 0.072 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/cuda.jsonl` | 0.072 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graphify/gds/36f3b4aef271.json` | 0.072 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/mn_constitution.jsonl` | 0.071 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/fetch_report_20260324_154909.json` | 0.071 | `json_document` | ✅ Yes (rule: `scripts/court_data/`) | `runtime-safe` | `keep_runtime` |
| `docs/graph/repo-env-map.json` | 0.070 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-env-map.json` | 0.070 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `tmp/llm-wiki-chunks/attention-mechanism-rg.ndjson` | 0.069 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/sourceRef-parent-join-dry-run.json` | 0.069 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `tmp/llm-wiki-chunks/fine-tuning-rg.ndjson` | 0.068 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/repo-archive-move-plan-2026-06-01.json` | 0.066 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-08T21-29-20/report.json` | 0.066 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `docs/reports/sourceRef-parent-join-archive-plan.json` | 0.065 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/phase100/source-feature-connections.json` | 0.064 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/extracted-patterns/drizzle-orm-extracted.jsonl` | 0.064 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/drizzle-orm-extracted.jsonl` | 0.064 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/scripts/phase103b-scan.json` | 0.063 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/bullmq-to-rabbitmq-migration-report.json` | 0.062 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-14_075b98e459.json` | 0.061 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/parent-atlas-production-readiness-report.json` | 0.060 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta_backup_20260101/0012_snapshot.json` | 0.060 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `tmp/llm-wiki-chunks/tokenization-rg.ndjson` | 0.059 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-13_d2b954da45.json` | 0.059 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/hidden_directory_suppressed.jsonl` | 0.059 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `scripts/tests/screenshots/2026-04-07T00-48-09/report.json` | 0.059 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `drizzle/meta/0000_snapshot.json` | 0.058 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tmp/task-distillates.json` | 0.056 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/runtime-packet-backfill-plan.json` | 0.056 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta_backup_20260101/20251025072421_snapshot.json` | 0.055 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta_backup_20260101/20251025072351_snapshot.json` | 0.055 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/training-datasets/svelte5-patterns.jsonl` | 0.054 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/packets/atlas-node-authority.jsonl` | 0.054 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `scripts/tests/screenshots/2026-04-04T03-39-00/report.json` | 0.054 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/settings.json.report.json` | 0.053 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `package.json` | 0.053 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/server/db/meta/0000_snapshot.json` | 0.053 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/graph/topology-ontology-clusters.json` | 0.053 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/npm-library-inventory.json` | 0.053 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets-old/svelte5-patterns.jsonl` | 0.053 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `.tmp/ingest/lanes/codebase_features.ndjson` | 0.052 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/packets/rg-knowledge-packets.ndjson` | 0.052 | `ndjson_dataset` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `simd-bridge/cpp/build-x64-fallback/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CXX.bin` | 0.051 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-x64-fallback/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_C.bin` | 0.051 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-x64-cuda-cuvs/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CXX.bin` | 0.051 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-x64-cuda-cuvs/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_C.bin` | 0.051 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-x64-cuda-cublas/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CXX.bin` | 0.051 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-x64-cuda-cublas/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_C.bin` | 0.051 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-x64-cuda/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CXX.bin` | 0.051 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-x64-cuda/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_C.bin` | 0.051 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-verify-2026-05-31T08-06-57-567Z/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CXX.bin` | 0.051 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-verify-2026-05-31T08-06-57-567Z/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_C.bin` | 0.051 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-verify-2026-05-31T08-06-45-478Z/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CXX.bin` | 0.051 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-verify-2026-05-31T08-06-45-478Z/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_C.bin` | 0.051 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `scripts/training-datasets/glyph-pairs-latest.jsonl` | 0.051 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/training-datasets/glyph-pairs-2026-06-10T17-42-03-019Z.jsonl` | 0.051 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/vt_constitution.jsonl` | 0.051 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `docs/reports/messy-query-routing-eval.json` | 0.050 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-11T03-27-27/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-51/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-43/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-19-54/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-18-43/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-13/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-06/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-35-01/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-33-59/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-17-33/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-15-45/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-07-17/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-05-46/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-00-23/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-59-03/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-47-57/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-46-36/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-40-05/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-38-52/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-15-48/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-14-58/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-11-06/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-09-19/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-17-36/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-16-15/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-01-53/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-00-27/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-26/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-09-00/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-07-15/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-24-30/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-23-31/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-18-05/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-17-08/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-00-02/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T20-59-02/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-37-24/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-36-07/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/graph_edges.json` | 0.050 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/tsconfig.audit.ui.json.report.json` | 0.049 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/repairs/tsconfig.audit.shims.json.report.json` | 0.049 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/repairs/tsconfig.audit.ollama.json.report.json` | 0.049 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/phantom-commas-ts-report.json` | 0.049 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-17-52/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-16-53/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-06-54/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-05-28/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-33-50/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-30-24/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-24-07/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-19-55/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-15-49/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-14-54/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-49/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-02/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-15-45/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-14-59/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-10-45/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-09-56/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-05-17/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-04-24/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-59-44/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-58-52/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-54-38/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-53-53/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-05-51/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-45-53/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-44-23/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-43-52/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-40-55/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-28-36/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-27-34/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-24-39/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-22-43/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-57/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-05/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-45-13/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-44-19/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-31-18/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-30-23/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-25-25/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-23-56/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-58/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-07/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-57/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-02/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-42-53/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-54/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-01/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-39-25/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-34-44/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-33-51/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-30-37/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-29-33/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-27-03/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-26-59/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-59/graph_edges.json` | 0.049 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-47-36/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-44-14/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-40-45/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-39-46/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-31/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-11/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-07-10/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-00-48/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-08/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-02/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-14-40/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-46/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-18/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-06/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-03/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-07-59/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-30/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-05/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-59-42/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-53-22/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-52-31/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-34/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-24/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-45-52/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-33-56/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-20/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-15/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-26-55/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-24-29/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-56/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-06/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-13-19/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/index/dependency-audit.json` | 0.049 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-11-51/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-09-00/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-08-31/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-07-29/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-06-18/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-02-09/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-01-36/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-56-22/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-55-50/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T14-55-56/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-42-15/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-41-43/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-49/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-17/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-08-12/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-07-52/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-05-35/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-04-38/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-56-03/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-48-10/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-47-46/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-29/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-11-51/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-03-59/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-24/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-09/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-46-33/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-39/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-40-07/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-33/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-33-38/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-22-48/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-08-08/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-21-48/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-06-12/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-19-09/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-05-54/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-18-50/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/graph_edges.json` | 0.049 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/packets/synthetic-traces.jsonl` | 0.048 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/repairs/tsconfig.audit.json.report.json` | 0.047 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/feature-labels.ndjson` | 0.047 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/cuvs-benchmark/latest.json` | 0.047 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta_backup_20260101/20250910183346_snapshot.json` | 0.047 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/rag-hits.jsonl` | 0.046 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs/reports/temporal-task-registry-report.json` | 0.046 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/runs/claude-code/2026-05-12.jsonl` | 0.045 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/missing-commas-fix-report.json` | 0.045 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/async-fix-test-results.json` | 0.045 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-11T21-23-55/report.json` | 0.045 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-06T17-55-27/report.json` | 0.045 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `memory/packets/atlas-state-snapshots.jsonl` | 0.044 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `scripts/tests/screenshots/production-proof/report.json` | 0.044 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-17T04-45-07/report.json` | 0.044 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-15T04-06-50/report.json` | 0.044 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-11T20-13-43/report.json` | 0.044 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-07T01-07-53/report.json` | 0.044 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/settings.json.report.json.items.jsonl` | 0.043 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `memory/packets/chunk-0017.msgpack` | 0.043 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0013.msgpack` | 0.043 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0010.msgpack` | 0.043 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `scripts/unsloth-training/extracted-patterns/typescript-extracted.jsonl` | 0.043 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/typescript-extracted.jsonl` | 0.043 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/tests/screenshots/2026-04-17T04-40-11/report.json` | 0.043 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-09T02-43-44/report.json` | 0.043 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-09T02-43-33/report.json` | 0.043 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/cards/selected-cards.json` | 0.043 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/lanes/som_edge.ndjson` | 0.042 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/packets/chunk-0022.msgpack` | 0.042 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0019.msgpack` | 0.042 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0011.msgpack` | 0.042 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0009.msgpack` | 0.042 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0008.msgpack` | 0.042 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0005.msgpack` | 0.042 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0004.msgpack` | 0.042 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0003.msgpack` | 0.042 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/exports/pathway-cards.jsonl` | 0.042 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/datasets/llm_synthesis/2026-05-30.jsonl` | 0.042 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs/reports/hidden-packet-pathmap-report.json` | 0.042 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/mini_active_nvme_cache/agents-graph.min.json` | 0.042 | `json_document` | ✅ Yes (rule: `mini_active_nvme_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/mo_constitution.jsonl` | 0.042 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graphify/gds/cefce7b4c69f.json` | 0.042 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/tsconfig.audit.ui-quickaction.json.report.json` | 0.041 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/repairs/tsconfig.audit.phase14.json.report.json` | 0.041 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/tmp/centroids.json` | 0.041 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tmp/centroids-test.json` | 0.041 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tmp/centroids-ci.json` | 0.041 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/packets/chunk-0018.msgpack` | 0.041 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0016.msgpack` | 0.041 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0014.msgpack` | 0.041 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0007.msgpack` | 0.041 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0006.msgpack` | 0.041 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0001.msgpack` | 0.041 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `scripts/tests/screenshots/2026-04-06T05-26-41/report.json` | 0.041 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08T10-47-29/vault-walker-smoke.json` | 0.041 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/promote-verified-packets.json` | 0.040 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `memory/packets/chunk-0023.msgpack` | 0.040 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0021.msgpack` | 0.040 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0020.msgpack` | 0.040 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0015.msgpack` | 0.040 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0012.msgpack` | 0.040 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/packets/chunk-0002.msgpack` | 0.040 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-cluster-summaries.json` | 0.040 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/legal-analysis-expanded.jsonl` | 0.040 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs/graph/cluster-summaries.json` | 0.040 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/exports/pathway-cards.jsonl` | 0.040 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/exports/karpathy-publish-split.json` | 0.040 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/tsconfig.audit.ui.json.report.json.items.jsonl` | 0.039 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/tsconfig.audit.shims.json.report.json.items.jsonl` | 0.039 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/tsconfig.audit.ollama.json.report.json.items.jsonl` | 0.039 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/postgres-promotion-schema-audit.json` | 0.039 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `memory/knowledge/document-knowledge-report.json` | 0.039 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/knowledge/document-knowledge-cards.langext.jsonl` | 0.039 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/repairs/unwrapped/tsconfig.audit.json.report.json.items.jsonl` | 0.038 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/db-usage-graph-summary.json` | 0.038 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/redis-monitoring-config.json` | 0.038 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/feature-card-duckdb-ready.json` | 0.038 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/lanes/route.ndjson` | 0.037 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/graph/qdrant-cluster-tag-audit.json` | 0.037 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-qdrant-cluster-tag-audit.json` | 0.037 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/feature-labels.json` | 0.036 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08T10-20-46/vault-walker-smoke.json` | 0.035 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/atlas/codebase-atlas.top.json` | 0.035 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/c9dba5ed751d.json` | 0.034 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/tsconfig.audit.ui-quickaction.json.report.json.items.jsonl` | 0.033 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/tsconfig.audit.phase14.json.report.json.items.jsonl` | 0.033 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `docs/reports/parent-atlas-crosswalk.json` | 0.032 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08T10-19-05/vault-walker-smoke.json` | 0.032 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/lanes/gemma_recommendation.ndjson` | 0.031 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/knowledge/document-knowledge-cards.jsonl` | 0.031 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/simd-bridge-memory-audit.json` | 0.030 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `docs/reports/concept-records.json` | 0.030 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/packets/chunk-0024.msgpack` | 0.030 | `msgpack_chunk` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/exports/drizzle-schema-drift-report.json` | 0.030 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/datasets/llm_synthesis/2026-06-06.jsonl` | 0.030 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `scripts/training-datasets/active-sample-latest.jsonl` | 0.030 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/training-datasets/active-sample-2026-06-10T17-41-56-936Z.jsonl` | 0.030 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-06-11T03-27-27/llm_synthesis_mapping.json` | 0.030 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/llm_synthesis_mapping.json` | 0.030 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-59/llm_synthesis_mapping.json` | 0.030 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/llm_synthesis_mapping.json` | 0.030 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/llm_synthesis_mapping.json` | 0.030 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/llm_synthesis_mapping.json` | 0.030 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/phase19b-join-key-discovery.json` | 0.029 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `memory/datasets/llm_synthesis/2026-06-09.jsonl` | 0.029 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/datasets/llm_synthesis/2026-06-08.jsonl` | 0.029 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/datasets/llm_synthesis/2026-06-03.jsonl` | 0.029 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-codebase-pagerank-top100.json` | 0.029 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/fullstack-training-combined.jsonl` | 0.029 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-06-06T02-04-19/mcp-tool-audit.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-06-06T01-50-52/mcp-tool-audit.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-06-06T01-36-20/mcp-tool-audit.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-17-33/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-15-45/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-07-17/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-05-46/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-00-23/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-59-03/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/wi_constitution.jsonl` | 0.029 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-47-57/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-46-36/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-40-05/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-38-52/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-15-48/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-14-58/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-11-06/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-09-19/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-17-36/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-16-15/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-01-53/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-00-27/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-26/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-09-00/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-07-15/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-24-30/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-23-31/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-18-05/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-17-08/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-00-02/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T20-59-02/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-37-24/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-36-07/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-17-52/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-16-53/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-06-54/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-05-28/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-33-50/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-30-24/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-24-07/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-19-55/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-15-49/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-14-54/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-49/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-02/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-15-45/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-14-59/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-10-45/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-09-56/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-05-17/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-04-24/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-59-44/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-58-52/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-54-38/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-53-53/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-05-51/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-45-53/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-44-23/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-43-52/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-40-55/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-28-36/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-27-34/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-24-39/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-22-43/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-57/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-05/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-45-13/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-44-19/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-31-18/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-30-23/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-25-25/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-23-56/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-58/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-07/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-57/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-02/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-42-53/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-54/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-01/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-39-25/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-34-44/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-33-51/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-30-37/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-29-33/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-27-03/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-26-59/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/llm_synthesis_mapping.json` | 0.029 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/kb/cards/embedding_jobs.jsonl` | 0.029 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-47-36/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-44-14/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-40-45/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-39-46/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-56/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-06/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-13-19/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-11-51/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-09-00/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-08-31/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-07-29/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-06-18/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-02-09/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-01-36/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-56-22/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-55-50/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T14-55-56/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-42-15/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-41-43/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-49/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-17/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-08-12/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-07-52/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-05-35/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-04-38/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-56-03/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-48-10/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-47-46/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-29/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-11-51/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-03-59/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-24/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-09/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-46-33/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-39/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-40-07/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-33/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-33-38/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-22-48/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-08-08/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-21-48/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-06-12/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-19-09/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-05-54/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-18-50/llm_synthesis_mapping.json` | 0.029 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/codebase-pagerank-top100.json` | 0.028 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-51/llm_synthesis_mapping.json` | 0.028 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-43/llm_synthesis_mapping.json` | 0.028 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/llm_synthesis_mapping.json` | 0.028 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/llm_synthesis_mapping.json` | 0.028 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-19-54/llm_synthesis_mapping.json` | 0.028 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-18-43/llm_synthesis_mapping.json` | 0.028 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-13/llm_synthesis_mapping.json` | 0.028 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-06/llm_synthesis_mapping.json` | 0.028 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-35-01/llm_synthesis_mapping.json` | 0.028 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-33-59/llm_synthesis_mapping.json` | 0.028 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/codemod_json.jsonl` | 0.028 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-17-02/mcp-tool-audit.json` | 0.028 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `.tmp/repairs/unwrapped/unwrap-report.2026-05-31T07-31-16-950Z.json` | 0.027 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/dry-run-analysis.json` | 0.027 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/postgres-contract-mirrors-report.json` | 0.027 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08T10-43-19/vault-walker-smoke.json` | 0.027 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08T10-41-57/vault-walker-smoke.json` | 0.027 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08T10-41-26/vault-walker-smoke.json` | 0.027 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/parent-atlas-reingest-report.json` | 0.026 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/lanes/import.ndjson` | 0.026 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/duckdb-feature-gap-report.json` | 0.026 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/couchdb-mapreduce-reingest-report.json` | 0.026 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/repo-couchdb-mapreduce-report.json` | 0.026 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/polyglot_training_data.jsonl` | 0.026 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/packets/lora-training-pairs.jsonl` | 0.026 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-08T10-17-48/vault-walker-smoke.json` | 0.026 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.claude/settings.local.json` | 0.025 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/directory-role-map.json` | 0.025 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-directory-role-map.json` | 0.025 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/feature-card-duckdb-ready.ndjson` | 0.025 | `ndjson_dataset` | ✅ Yes (rule: `*.ndjson`) | `cold` | `ldjson_batch` |
| `scripts/tests/screenshots/2026-04-09T02-39-46/report.json` | 0.025 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-09T02-39-16/report.json` | 0.025 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-09T02-37-53/report.json` | 0.025 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-09T02-36-04/report.json` | 0.025 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-31/llm_synthesis_mapping.json` | 0.025 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-11/llm_synthesis_mapping.json` | 0.025 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-07-10/llm_synthesis_mapping.json` | 0.025 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/exports/feature-map-cards.jsonl` | 0.025 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-08T09-50-21/vault-walker-smoke.json` | 0.025 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `benchmarks/retrieval-100.jsonl` | 0.024 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/uploads/transcriptions/transcription-1330f67c-bf15-4e3a-8da3-3565271b70ef.json` | 0.024 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/qdrant-path-bridge-latest.json` | 0.024 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/ky_constitution.jsonl` | 0.024 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T14-55-56/audit_failures.json` | 0.024 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `docs/reports/schema-indexer-contract-report.json` | 0.023 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/packets/nes-chrom-packets.jsonl` | 0.023 | `jsonl_dataset` | ❌ No | `runtime-safe` | `msgpack_ingest` |
| `memory/datasets/llm_synthesis/2026-05-24.jsonl` | 0.023 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/duckdb/atlas.duckdb` | 0.023 | `duckdb_database` | ✅ Yes (rule: `.tmp/`) | `cold` | `cold_archive` |
| `sveltekit-frontend/data/agent-conversations.jsonl` | 0.023 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/kb/notecards/graph_file_cards.report.json` | 0.023 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/index/ast-relations.jsonl` | 0.023 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `docs/reports/neschrom97-qdrant-tag-plan.json` | 0.022 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/extracted-patterns/sveltekit-api-extracted.jsonl` | 0.022 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/sveltekit-api-extracted.jsonl` | 0.022 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-06-11T03-27-26/redis_key_map.json` | 0.022 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/redis_key_map.json` | 0.022 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/redis_key_map.json` | 0.022 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/redis_key_map.json` | 0.022 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/redis_key_map.json` | 0.022 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-25/redis_key_map.json` | 0.022 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/feature-todo-queue.ndjson` | 0.021 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/opencode.json` | 0.021 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/css-comma-fix-report.json` | 0.021 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/runtime-packet-density-report.json` | 0.021 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/redis_key_map.json` | 0.021 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/redis_key_map.json` | 0.021 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ace-diff-sniffer.json` | 0.020 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/smoke-feature-traversal-report.json` | 0.020 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/feature-organization-proposal.json` | 0.020 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/knowledge/schema-indexer-contract-cards.qdrant-preview.jsonl` | 0.020 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/knowledge/schema-indexer-contract-cards.embeds.jsonl` | 0.020 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/precomputed_embeddings.jsonl` | 0.020 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/codebase-index.json` | 0.020 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/kag-phase-gate-latest.json` | 0.020 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/feature-labelling-parent-atlas-report.json` | 0.020 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/redis_key_map.json` | 0.020 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ingester-enriched-features.json` | 0.019 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-feature-registry.json` | 0.019 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/training-datasets/rag-context.jsonl` | 0.019 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `phase13graph_exportgenerator/opencode-atlas-context-added.json` | 0.019 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/phase103.2-scan-results.json` | 0.019 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/phase80-stratification-report.json` | 0.019 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/recommendations.json` | 0.019 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/redis_key_map.json` | 0.019 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/redis_key_map.json` | 0.019 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/redis_key_map.json` | 0.019 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/redis_key_map.json` | 0.019 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/analysis_reports/case_audit_1774478663.json` | 0.019 | `json_document` | ✅ Yes (rule: `scripts/analysis_reports/`) | `cold` | `ignore_generated` |
| `.tmp/repairs/unwrapped/svelte5-patterns.jsonl.items.jsonl` | 0.018 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/launch.json.report.json` | 0.018 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `granite-docling-258M/tokenizer_config.json` | 0.018 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/parent-atlas-rg-dump-projection.json` | 0.018 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scratch/build_errors.json` | 0.018 | `json_document` | ✅ Yes (rule: `scratch/`) | `runtime-safe` | `keep_runtime` |
| `simd-bridge/cpp/build-clangd/CMakeFiles/feature_tests.bin` | 0.018 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/svelte5-official-docs.jsonl` | 0.018 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/tests/vlm-tests/vlm_request.json` | 0.018 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/vlm-tests/vlm_endpoint_request.json` | 0.018 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/doj_press_releases.jsonl` | 0.018 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/redis_key_map.json` | 0.018 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/033cfb82d830.json` | 0.018 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/analysis_reports/retrieval_eval_1774397662.json` | 0.018 | `json_document` | ✅ Yes (rule: `scripts/analysis_reports/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/uiux_training_data.jsonl` | 0.017 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/real-world-routing-eval.json` | 0.017 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/neschrom97-qdrant-tag-apply-report.json` | 0.017 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-couchdb-mapreduce-report.json` | 0.017 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `simd-bridge/cpp/build-clangd/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_CXX.bin` | 0.017 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `simd-bridge/cpp/build-clangd/CMakeFiles/4.0.0/CMakeDetermineCompilerABI_C.bin` | 0.017 | `binary_weights` | ✅ Yes (rule: `*.bin`) | `gpu-turbovec` | `gpu_training_input` |
| `sveltekit-frontend/drizzle/sidecar-audit-report.json` | 0.017 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/svelte5-runes.jsonl` | 0.017 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/for-to-htmlfor-report.json` | 0.017 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `scripts/promotion/promotion-queue.manifest.json` | 0.017 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/redis_key_map.json` | 0.017 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-14/redis_key_map.json` | 0.017 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-03-16/redis_key_map.json` | 0.017 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/analysis_reports/case_audit_1774478749.json` | 0.017 | `json_document` | ✅ Yes (rule: `scripts/analysis_reports/`) | `cold` | `ignore_generated` |
| `.tmp/vscode-workspace-health.json` | 0.016 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/build_log.json.report.json` | 0.016 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/sourceRef-first/parent_atlas_sourceRef_first_cluster_19067cadf0_fb3aec99cf9cad58.json` | 0.016 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `docs/reports/hidden-packet-pathmap-duckdb-report.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/knowledge/schema-indexer-contract-cards.jsonl` | 0.016 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `scripts/tests/zod-validation-report.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/function-param-semicolons-report.json` | 0.016 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/nc_constitution.jsonl` | 0.016 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/de_constitution.jsonl` | 0.016 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-00-48/llm_synthesis_mapping.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-08/llm_synthesis_mapping.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-02/llm_synthesis_mapping.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-14-40/llm_synthesis_mapping.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-46/llm_synthesis_mapping.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-18/llm_synthesis_mapping.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-06/llm_synthesis_mapping.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-03/llm_synthesis_mapping.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-07-59/llm_synthesis_mapping.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-30/llm_synthesis_mapping.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-05/llm_synthesis_mapping.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-59-42/llm_synthesis_mapping.json` | 0.016 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/launch.json.report.json.items.jsonl` | 0.015 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/build_log.json.report.json.items.jsonl` | 0.015 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/sourceRef-first/parent_atlas_sourceRef_first_feature_cache_71db4b96c7f2c392.json` | 0.015 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/training-datasets/evidence-patterns.jsonl` | 0.015 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/packets/semantic-cache-candidates.jsonl` | 0.015 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/enhanced_training_data.jsonl` | 0.015 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/rag-retrieval-patterns.jsonl` | 0.015 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/training-datasets/glyph-pairs-2026-06-03T18-27-08-072Z.jsonl` | 0.015 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/phase40-critical-files.json` | 0.015 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/tx_constitution.jsonl` | 0.015 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/fetch_report_20260324_155334.json` | 0.015 | `json_document` | ✅ Yes (rule: `scripts/court_data/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/schema_access_map.json` | 0.015 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/schema_access_map.json` | 0.015 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/schema_access_map.json` | 0.015 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-14/schema_access_map.json` | 0.015 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-03-16/schema_access_map.json` | 0.015 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-53-22/llm_synthesis_mapping.json` | 0.015 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-52-31/llm_synthesis_mapping.json` | 0.015 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-34/llm_synthesis_mapping.json` | 0.015 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-24/llm_synthesis_mapping.json` | 0.015 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-45-52/llm_synthesis_mapping.json` | 0.015 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-33-56/llm_synthesis_mapping.json` | 0.015 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-20/llm_synthesis_mapping.json` | 0.015 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-15/llm_synthesis_mapping.json` | 0.015 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-26-55/llm_synthesis_mapping.json` | 0.015 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/exports/karpathy-qdrant-cluster-backfill.jsonl` | 0.015 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `.tmp/simd-native-bridge-validation.json` | 0.014 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/unwrap-report.2026-05-31T07-30-07-741Z.json` | 0.014 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/legal-keywords.jsonl.report.json` | 0.014 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/consolidation-report.json` | 0.014 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/backups-top40.json` | 0.014 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ast-unresolved-imports.jsonl` | 0.014 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/packets/rg-toc.json` | 0.014 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `opencode.backup.json` | 0.014 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/next-moves-recommendation.json` | 0.014 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/atlas-token-map.preview.json` | 0.014 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/gemma-recommendations.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/gemma-recommendations.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/audits/latest-audit.json` | 0.014 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/docs_training_data.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/ternary-fix-report.json` | 0.014 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/pattern-analysis.json` | 0.014 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-11T03-27-27/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-51/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-43/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-19-54/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-18-43/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-13/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-06/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-35-01/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-33-59/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-17-33/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-15-45/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-07-17/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-05-46/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-00-23/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-59-03/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-47-57/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-46-36/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-40-05/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-38-52/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-15-48/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-14-58/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-11-06/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-09-19/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-17-36/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-16-15/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-01-53/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-00-27/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-26/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-09-00/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-07-15/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/schema_access_map.json` | 0.014 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/schema_access_map.json` | 0.014 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-24-30/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-23-31/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/schema_access_map.json` | 0.014 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-18-05/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-17-08/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/schema_access_map.json` | 0.014 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-00-02/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-20T20-59-02/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-37-24/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-36-07/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/schema_access_map.json` | 0.014 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-17-52/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-16-53/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-06-54/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-05-28/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-33-50/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-30-24/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-24-07/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-19-55/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-15-49/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-14-54/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-49/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-02/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-15-45/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-14-59/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-10-45/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-09-56/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-05-17/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-04-24/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-59-44/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-58-52/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-54-38/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-53-53/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-05-51/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-45-53/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-44-23/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-43-52/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-40-55/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-28-36/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-27-34/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-24-39/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-22-43/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-57/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-05/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-45-13/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-44-19/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-31-18/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-30-23/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-25-25/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-23-56/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-58/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-07/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-57/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-02/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-42-53/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-54/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-01/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-39-25/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-34-44/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-33-51/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-30-37/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-29-33/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-27-03/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-26-59/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-59/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-47-36/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-44-14/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-40-45/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-39-46/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-24-29/llm_synthesis_mapping.json` | 0.014 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-56/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-06/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-13-19/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-11-51/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-09-00/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-08-31/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-07-29/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-06-18/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-02-09/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-01-36/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-01-36/audit_failures.json` | 0.014 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-56-22/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-56-22/audit_failures.json` | 0.014 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-55-50/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T14-55-56/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-42-15/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-41-43/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-49/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-17/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-08-12/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-07-52/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-05-35/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-04-38/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-56-03/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-48-10/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-47-46/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-29/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-11-51/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-11-51/audit_failures.json` | 0.014 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-03-59/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-03-59/audit_failures.json` | 0.014 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-24/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-09/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-46-33/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-46-33/audit_failures.json` | 0.014 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-39/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-40-07/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-33/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-33-38/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-22-48/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-22-48/audit_failures.json` | 0.014 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-08-08/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-21-48/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-06-12/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-19-09/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-05-54/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-18-50/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/ingest.jsonl` | 0.014 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `.tmp/vscode-extension-performance-log.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage/20260520-191055/ranked-failures.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/unwrap-report.2026-05-31T07-30-07-741Z.json.items.jsonl` | 0.013 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/env_OLLAMA_MODEL.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/env_COUCHDB_URL.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/e225aef9ad3b38a8.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/e21e4cf9e0e269dc.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/e21dc77771e7351e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/e21935ed97162fb5.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/e21356be13b6d131.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/e203cc2c6a3d5ad0.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/e1ff883c14cfdf0e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/e1fecf4b16414c02.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/e1f50aaaee8a7a6f.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/audit_hotspot_2026-05-30T20-02-16_cluster_gpu_92.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/audit_gate_2026-05-30T20-02-16_g40_glyph_cache_pass.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/audit_gate_2026-05-30T20-02-16_g27_som_consumers.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/audit_gate_2026-05-30T20-02-16_g27_pass.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/audit_gate_2026-05-30T20-02-16_g27_kmeans_consumers.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/audit_gate_2026-05-30T20-02-16_g25_runes_in_plain_ts.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/audit_gate_2026-05-30T20-02-16_g23_svelte4_events.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/audit_gate_2026-05-30T20-02-16_g22_svelte4_reactive.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/audit_gate_2026-05-30T20-02-16_g21_svelte4_props.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/audit_gate_2026-05-30T20-02-16_g19_missing_zod.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/audit_gate_2026-05-30T20-02-16_g18_missing_auth.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/audit_gate_2026-05-30T20-02-16_g17_localhost_hardcoded.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/audit_failure_2026-05-30T20-02-16_G17_src_lib_server_ai_mcp-tool-bridge.ts.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/parent_atlas_packets/0566387d5eff8880.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/055de8d46baffa85.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/055bafc6e978f31d.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0556d469083645d7.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/054b73931c0bf374.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/054729cd34017f3e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0544214fb38fcf9a.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/053cab5faf25f0f7.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/052d2ee3ad5c295e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/05250dc8f40383f5.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/052137b6ec09464b.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0509751baf2a0190.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0508f90968fbe9db.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04ee4ff3c992daec.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04eb24394995dd6a.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04e718be5af03b1d.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04d791ea740d5b0a.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04c0ad5d7822d926.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04b8d3f6aad31e54.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04b4ee5de7bdeaa7.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/048699597e424ba8.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04773c08dafa7f33.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/047159a0680d8316.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04679597b5d364ef.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04563ad7bc7bd3d0.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04517a30c0c92331.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/044acab38aa95f00.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0448d0e2225cd18b.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0440b16fc04889ab.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0439f41a871f30bf.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04353af433cb3049.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0429e0aeeeaa8b31.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0421c55eea4d6d01.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0412233b68ea1040.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/040ebac4853b857e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/040392cd7175123d.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/04019748644a4b52.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03fb1f6ad5cf910d.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03ef83c8a052b0c0.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03e74a376a075bf3.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03e14cfaf790ed77.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03e0fbe1c46ea382.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03d373cd3e1f8ec5.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03c70049866f88b0.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03b5760840e471ae.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03b09f2d51609f2f.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03aad3579e2ed28c.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03a5f9488be47441.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03a3f03f7314dd19.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03a346cecd4eb6b7.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/039d069c35daff3f.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/039ca9bf82d025c0.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0397414aa7006adb.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03949a93ee80ba1d.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0389b5452057662b.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0389628fc25d5306.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/037cc690ff5106e3.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/037cb9a27af5e9cf.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/037012482cc4474e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0361210742dfdd6e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/035c522ebbbcdd5d.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/035aa2a7fec2c54b.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/034485c9b005446b.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/033b0ad8edfee3dd.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0335e87d2bafa7ce.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03351baa29fba5a5.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0324eb2e3143a773.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/032019ce1bf0345c.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/031db91771dd5a02.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0308f531c85d5804.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0300dcfc4d23344d.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02f6e7fb7c0e7451.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02ed82fbdc75c973.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02e1bdb43a4d9ec0.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02e15aaa64e9547b.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02df2d195de7e47d.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02db9392f4e32836.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02d6d5dac6b75c56.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02cfd0e189b724dc.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02cf69b0e9b24066.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02cb8a2cae16bdae.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02c85f601b99752a.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02bf23f02b4eca0e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02bdad5e94d6af6b.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02bb250e49554089.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02b3dedbacb85f9b.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02b25302bb18b930.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02b13f822614c604.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02abca46b74f6b1a.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/029c99c656679142.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/029c081fcb7c687e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/029772b692b7d3c4.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/027f978ee9724521.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/027d9c66454518f1.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/027b97529e921d16.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0276c4d0906fd014.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0270849ffd85b308.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/026f931d5ddb4e15.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02660f795d104c53.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/026319be52caef60.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02611fa6e5886c23.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/024f8973c0da4e20.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/023f71fd6a387629.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/023ae7c3181a79ff.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/023a357b64af438a.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0236a70ae076de62.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0232b28b94b16a2e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02318915bf53fc79.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/023116f7dd2d2791.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/023025f3514b11ff.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/021f2c521a230f3a.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/021ced9efb90d060.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/021b14a2f39ec72e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0214853329b1f651.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0212cb44df359a58.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/020b6f5f39b7233c.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02017f5bee894a7b.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01f7d6e3e42cede9.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01f58df7c9edcea9.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01f0af8d35f3583f.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01f0ae80c775d8da.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01e6b01a790663ca.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01e1657967e949c1.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01d16f576344841f.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01cb823b12408bc0.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01c6a5605c27e5fc.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01c469b5c1811b96.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01c20b96e1e377a3.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01aebc03901a5aaf.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01a862043c8c156e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01a62b77dc3374be.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01a390422666396a.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/019a1a18c5a36961.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0192524efece8a97.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/018ee3a7166e2539.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/018ec061477a0264.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01894a389e7eff90.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0172337b4ed348d6.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0167f3ca94dc2620.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/015fdb847bd4b1fe.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/015f759e91f3e398.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/015d0d46e2512b31.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/013f2ecd0be93182.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/013d249936c805aa.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/012eadc6ea32515f.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/012bdcf41b358b39.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0129e35b12f3d546.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01195c4fd7875b60.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01173cbc9ea61255.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/010d0b2d9524ea21.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00ff4b115be2d0ba.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00f9b72594f1e8c1.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00f4245426617dab.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00e841b0b956f18e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00e5d971c47c8ae9.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00de915f0301dacb.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00dcd72830a5244f.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00d8acf7823fae83.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00d6d263332b5312.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00cd512fb4f9a7be.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00cadc920830512d.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00cab26de4491175.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00c681c077a81a5d.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00c2c6e692efd4a1.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00a7f26545d7a728.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00a337a7c6c8fadc.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/009d83f27333771d.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0099365f2954a7c8.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00956a83446f98eb.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/008d27b749e0742c.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/008c047432b8fdd4.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/008b374b79d2d44e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/006f14c54a2cbd19.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/006535601f442f32.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/006501fd958b9d97.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/005d877f65beacff.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/005b287a19bf51c2.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0056213574662f41.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/004f8942bf2140ae.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/004cff5b333f1f92.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/004b71ea087384b7.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00376eb299856fbe.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/002fbf452f355e62.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/002eef270abc533c.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/002e5c7880802f89.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/002aee21948f778f.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/002add0263b8e6c8.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00262e5f02b7c99d.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0024f386d46d7f23.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/001f2d08e4459234.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/001570455730d2d7.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0012bc7350ff2a70.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00116e85cfe0456e.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/000678ef52ca67b0.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tmp/assignments.ndjson` | 0.013 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/tmp/assignments-test.ndjson` | 0.013 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/tmp/assignments-ci.ndjson` | 0.013 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/repo-organization-audit-2026-06-01.json` | 0.013 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `docs/reports/hidden-packet-pathmap-report.json` | 0.013 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/ace-packet-smoke-report.json` | 0.013 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/repo-qdrant-payload-atlas.json` | 0.013 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/recommendations.jsonl` | 0.013 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/knowledge/document-knowledge-redis-preview.jsonl` | 0.013 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/unknown-reasoning-results.json` | 0.013 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-qdrant-payload-atlas.json` | 0.013 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/sidecar-migrations.json` | 0.013 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/training-datasets/graphify-deep-supervised.jsonl` | 0.013 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/schema_access_map.json` | 0.013 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/schema_access_map.json` | 0.013 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/ri_constitution.jsonl` | 0.013 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/ks_constitution.jsonl` | 0.013 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/schema_access_map.json` | 0.013 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-25/schema_access_map.json` | 0.013 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/audit_failures.json` | 0.013 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `scripts/analysis_reports/licensing_report_1774396378.json` | 0.013 | `json_document` | ✅ Yes (rule: `scripts/analysis_reports/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/rag-context.jsonl.items.jsonl` | 0.012 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/unwrapped/legal-keywords.jsonl.report.json.items.jsonl` | 0.012 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/evidence-patterns.jsonl.items.jsonl` | 0.012 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/tsconfig-optimized.json.report.json` | 0.012 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent-atlas-index.json` | 0.012 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/dedup-codebase-chunk-index-2026-06-02.json` | 0.012 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-feature-map-gate2-report.json` | 0.012 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/startup-scripts-audit.json` | 0.012 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `docs/reports/cold-archive-manifest-2026-06-10.json` | 0.012 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/cold-archive-manifest-2026-06-03.json` | 0.012 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/cold-archive-manifest-2026-06-02.json` | 0.012 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/phase100/feature-graph.json` | 0.012 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/error-fix-proposals.json` | 0.012 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/knowledge/document-knowledge-ace-packs.jsonl` | 0.012 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/exports/drizzle_userid_audit.json` | 0.012 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-error-fix-proposals.json` | 0.012 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/stage-2c-500-phase-review.json` | 0.012 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-11T03-27-26/schema_access_map.json` | 0.012 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/schema_access_map.json` | 0.012 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/schema_access_map.json` | 0.012 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/gold_svelte5_migrations.jsonl` | 0.012 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T01-05-54/llm_synthesis_mapping.json` | 0.012 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-09T03-23-23/mcp-tool-audit.json` | 0.012 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-09T03-17-37/mcp-tool-audit.json` | 0.012 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-09T03-10-32/mcp-tool-audit.json` | 0.012 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-08T22-50-33/mcp-tool-audit.json` | 0.012 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-08T22-46-17/mcp-tool-audit.json` | 0.012 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-08T22-19-38/mcp-tool-audit.json` | 0.012 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-04/llm_synthesis_mapping.json` | 0.012 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-01/llm_synthesis_mapping.json` | 0.012 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/unwrap-report.2026-05-31T07-30-45-395Z.json` | 0.011 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/rag-context.jsonl.wrap-backup.2026-05-31T07-23-45-150Z.items.jsonl.retry-extracted.items.jsonl` | 0.011 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/unwrapped/rag-context.jsonl.wrap-backup.2026-05-31T07-23-45-150Z.items.jsonl` | 0.011 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/svelte5_training_data.jsonl` | 0.011 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `packages/parent-atlas/package-lock.json` | 0.011 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-12T07-56-43/lane1-retrieval.json` | 0.011 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-13_bb26bc9c01.json` | 0.011 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-11_6f78cfc345.json` | 0.011 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-05_654e32c98c.json` | 0.011 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/xgboost-hotness/features.json` | 0.011 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `simd-bridge/cpp/CMakePresets.json` | 0.011 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/top-errors.json` | 0.011 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/obvious-colon-corruption-report.json` | 0.011 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/class-spacing-fix-report.json` | 0.011 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/feature-gap-registry-live-latest.json` | 0.011 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/bifrost-cards-smoke-latest.json` | 0.011 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-06T20-26-58/report.json` | 0.011 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/vi_constitution.jsonl` | 0.011 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/kb/cards/codebase_graph_cards.report.json` | 0.011 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-31/ingest.jsonl` | 0.011 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-11/ingest.jsonl` | 0.011 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-07-10/ingest.jsonl` | 0.011 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-09T03-42-33/mcp-tool-audit.json` | 0.011 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-09T03-39-46/mcp-tool-audit.json` | 0.011 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-08T22-49-24/mcp-tool-audit.json` | 0.011 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-08T21-31-02/mcp-tool-audit.json` | 0.011 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/exports/xgboost-hotness/features.json` | 0.011 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08T06-53-45/mcp-tool-audit.json` | 0.011 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-08T06-44-04/mcp-tool-audit.json` | 0.011 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-08T06-35-00/mcp-tool-audit.json` | 0.011 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-08T05-57-38/mcp-tool-audit.json` | 0.011 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `.tmp/retrieval-replay-report.json` | 0.010 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/tsconfig-optimized.json.report.json.items.jsonl` | 0.010 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/evidence-patterns.jsonl.wrap-backup.2026-05-31T07-23-45-143Z.items.jsonl.retry-extracted.items.jsonl` | 0.010 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/unwrapped/evidence-patterns.jsonl.wrap-backup.2026-05-31T07-23-45-143Z.items.jsonl` | 0.010 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/ingester-kanban-tasks.jsonl` | 0.010 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/error-fix-proposals.jsonl` | 0.010 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/drizzle-audit-top20.json` | 0.010 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/svelte-errors-utf8.json` | 0.010 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `data/external-docs/chunks/drizzle.jsonl` | 0.010 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/parent-atlas-feature-command-atlas-projection.json` | 0.010 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/parent-atlas-compression-plan.json` | 0.010 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/cold-archive-manifest-2026-06-05.json` | 0.010 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `opencode.json` | 0.010 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-10_68e5a515b1.json` | 0.010 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-09_f23fcbcad9.json` | 0.010 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/parent-atlas-hypergraph.jsonl` | 0.010 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-recommendations.json` | 0.010 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/inference-observability-audit.json` | 0.010 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/agentic-orchestrator.jsonl` | 0.010 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets-old/rag-context.jsonl` | 0.010 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets-old/evidence-patterns.jsonl` | 0.010 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/typescript-advanced-curated.jsonl` | 0.010 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/training-datasets/glyph-pairs-2026-06-03T02-38-27-488Z.jsonl` | 0.010 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/training-datasets/glyph-pairs-2026-05-30T17-47-28-355Z.jsonl` | 0.010 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/PHASE78_MANIFEST.json` | 0.010 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/som-coordinate-backfill-report.json` | 0.010 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/01cb725b540e/gap_report.json` | 0.010 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08T05-48-00/mcp-tool-audit.json` | 0.010 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/agents-dag/cluster-2-2.json` | 0.010 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `scripts/analysis_reports/adversarial_eval_1774402338.json` | 0.010 | `json_document` | ✅ Yes (rule: `scripts/analysis_reports/`) | `runtime-safe` | `keep_runtime` |
| `scripts/analysis_reports/adversarial_eval_1774396222.json` | 0.010 | `json_document` | ✅ Yes (rule: `scripts/analysis_reports/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage/20260520-191008/ranked-failures.json` | 0.009 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage/20260520-190854/ranked-failures.json` | 0.009 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage/20260520-190822/ranked-failures.json` | 0.009 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/chr97-kanban-board.json` | 0.009 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `tmp/llm-wiki-chunks/retrieval-augmented-generation.ndjson` | 0.009 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/tmp/chunks/parents-corpus-all.ndjson` | 0.009 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/route-runtime-packets-report.json` | 0.009 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/repo-import-map.json` | 0.009 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/patterns.json` | 0.009 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-10-42/lane1-retrieval.json` | 0.009 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-10-06/lane1-retrieval.json` | 0.009 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-08_2359c31ae9.json` | 0.009 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-06_828115bba1.json` | 0.009 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/atlas/cards.jsonl` | 0.009 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `models/model-manifest.json` | 0.009 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-import-map.json` | 0.009 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/sveltekit-load.jsonl` | 0.009 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/bits-ui-curated.jsonl` | 0.009 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/training-datasets/active-sample-2026-06-03T18-27-00-225Z.jsonl` | 0.009 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/top-errors-phase3.json` | 0.009 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/top-errors-phase2.json` | 0.009 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/top-errors-phase2-final.json` | 0.009 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/.phase79-fixes.json` | 0.009 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-11T03-27-27/relationship_map.json` | 0.009 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-51/relationship_map.json` | 0.009 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-43/relationship_map.json` | 0.009 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/relationship_map.json` | 0.009 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/ne_constitution.jsonl` | 0.009 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/az_constitution.jsonl` | 0.009 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/qdrant_access_map.json` | 0.009 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/kb/cards/codebase_graph_cards.invalid.jsonl` | 0.009 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graphify/gds/db6c291a5936.json` | 0.009 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/d91d782d5faf.json` | 0.009 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/9abfc8955ede.json` | 0.009 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-3-3.json` | 0.009 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `.claude/settings.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/valkey-node-client-inventory.json` | 0.008 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ace-daily-todo-summary.json` | 0.008 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/retrieval-pass-dry-run.json` | 0.008 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/phase19c_qdrant/atlas-vector64-dataset.jsonl` | 0.008 | `binary_weights` | ✅ Yes (rule: `.tmp/`) | `gpu-turbovec` | `gpu_training_input` |
| `.tmp/phase19c/atlas-vector64-dataset.jsonl` | 0.008 | `binary_weights` | ✅ Yes (rule: `.tmp/`) | `gpu-turbovec` | `gpu_training_input` |
| `.tmp/gemma4-parent-atlas-summary-cache-report.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-cluster-assignments.centroids.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `tmp/llm-wiki-chunks/tokenization.ndjson` | 0.008 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/llm-wiki-chunks/som-clustering.ndjson` | 0.008 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/llm-wiki-chunks/quantization.ndjson` | 0.008 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/llm-wiki-chunks/kv-cache.ndjson` | 0.008 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/llm-wiki-chunks/graph-rag.ndjson` | 0.008 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/llm-wiki-chunks/fine-tuning.ndjson` | 0.008 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/llm-wiki-chunks/embedding-vectors.ndjson` | 0.008 | `binary_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `tmp/llm-wiki-chunks/backpropagation.ndjson` | 0.008 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/llm-wiki-chunks/attention-mechanism.ndjson` | 0.008 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/llm-wiki/corpus-index.ndjson` | 0.008 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/training-datasets/legal-keywords.jsonl` | 0.008 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/rg-search-integrity-report.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/cross-domain-routing-eval.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/skills/codebase_mapper.skill.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-47-55/lane1-retrieval.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-46-47/lane1-retrieval.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-42-12/lane1-retrieval.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-41-52/lane1-retrieval.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/packets/atlas-glyph-rewards.jsonl` | 0.008 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/exports/drizzle-drift-audit.json` | 0.008 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/.tmp/parent-atlas-profile-cards.jsonl` | 0.008 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/ace/packet-28a8adf4a4b229aa61df5e63532477b04b77442b94160ed5b31b13ae26fd5ca9.json` | 0.008 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/validation.jsonl` | 0.008 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/style-guide.jsonl` | 0.008 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/error_analysis.json` | 0.008 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/feature-card-duckdb-inspect.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-02-22T17-28-20/report.json` | 0.008 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-19-54/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-18-43/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-13/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-06/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-35-01/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-33-59/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-17-33/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-15-45/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-07-17/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-05-46/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-00-23/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-59-03/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/hi_constitution.jsonl` | 0.008 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-47-57/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-46-36/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-40-05/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-38-52/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-15-48/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-14-58/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-11-06/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-09-19/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-17-36/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-16-15/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-01-53/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-00-27/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-26/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-25/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-09-00/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-07-15/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-24-30/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-23-31/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-18-05/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-17-08/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-00-02/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T20-59-02/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-37-24/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-36-07/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-17-52/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-16-53/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-06-54/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-05-28/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-33-50/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-30-24/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-24-07/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-19-55/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-15-49/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-14-54/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-49/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-02/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-15-45/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-14-59/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-10-45/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-09-56/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-05-17/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-04-24/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-59-44/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-58-52/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-54-38/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-53-53/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-05-51/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-45-53/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-44-23/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-43-52/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-40-55/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-28-36/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-27-34/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-24-39/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-22-43/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-57/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-05/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-45-13/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-44-19/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-31-18/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-30-23/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-25-25/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-23-56/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-58/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-07/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-57/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-02/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-42-53/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-54/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-01/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-39-25/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-34-44/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-33-51/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-30-37/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-29-33/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-27-03/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-26-59/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-59/relationship_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-14/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-03-16/qdrant_access_map.json` | 0.008 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/kb/notecards/graph_file_cards.search.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-47-36/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-44-14/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-40-45/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-39-46/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-31/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-11/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-07-10/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-00-48/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-08/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-02/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-14-40/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-46/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-18/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-06/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-03/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-07-59/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-30/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-05/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-59-42/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-53-22/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-52-31/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-34/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-24/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-45-52/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-33-56/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-20/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-15/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-26-55/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-24-29/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-56/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-06/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-13-19/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-11-51/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-09-00/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-08-31/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-07-29/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-06-18/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-02-09/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-01-36/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-56-22/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-55-50/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T14-55-56/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-42-15/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-41-43/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-49/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-17/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08T04-32-51/mcp-tool-audit.json` | 0.008 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-08-12/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-07-52/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-05-35/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-04-38/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08T00-34-05/mcp-tool-audit.json` | 0.008 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-56-03/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-48-10/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-47-46/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-29/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08T00-13-11/mcp-tool-audit.json` | 0.008 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-11-51/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T23-40-33/mcp-tool-audit.json` | 0.008 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-24/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-03-59/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-09/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-46-33/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-39/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-40-07/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T23-33-32/mcp-tool-audit.json` | 0.008 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-33/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-33-38/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-22-48/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-08-08/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-21-48/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T23-01-22/mcp-tool-audit.json` | 0.008 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-06-12/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-19-09/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-05-54/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-18-50/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/relationship_map.json` | 0.008 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/analysis_reports/retrieval_eval_1774398238.json` | 0.008 | `json_document` | ✅ Yes (rule: `scripts/analysis_reports/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/unresolved-lib-edit-plan.json` | 0.007 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/drizzle-promotion-drift-audit.json` | 0.007 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/uploads/transcriptions/transcription-aa107402-1955-4df2-92b8-81df6bfcad1e.json` | 0.007 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/parent-atlas-rg-dump-organizer.json` | 0.007 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/data/route-organization-report.json` | 0.007 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-45-56/lane1-retrieval.json` | 0.007 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-41-33/lane1-retrieval.json` | 0.007 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-37-35/lane1-retrieval.json` | 0.007 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-37-08/lane1-retrieval.json` | 0.007 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/parent-atlas-final-completion.json` | 0.007 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/ace/packet-ace4ab403730eee1a69e514c840581e1389f6eaa27c4622718619c74e3fa1c7e.json` | 0.007 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/ace/packet-9d6d8dacd6715e45ac2417361a3b64ae3403ac142752d61020337fb08f06cc63.json` | 0.007 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/ace/packet-748183a3d3d0c3d2bbef320ae4a3ba16a7729360f283ed3d935494e0696ddca7.json` | 0.007 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/ace/packet-3ca4e86dc7e1fc15410b6c11f819cc6eca79b05ec34dd423d416ba7a9c1a76e9.json` | 0.007 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets-old/legal-keywords.jsonl` | 0.007 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/webgpu.jsonl` | 0.007 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/tests/screenshots/2026-04-15T03-37-52/report.json` | 0.007 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-11T03-27-26/qdrant_access_map.json` | 0.007 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-59/ace_hit_relationships.json` | 0.007 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/features/feature-trace-multi-server-mcp.json` | 0.007 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/features/feature-trace-graphrag-search.json` | 0.007 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/features/feature-1778382950358.json` | 0.007 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/exports/karpathy-publish-split.jsonl` | 0.007 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/analysis_reports/legal_eval_20260324_164927.json` | 0.007 | `json_document` | ✅ Yes (rule: `scripts/analysis_reports/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/active-unresolved-edit-proposals.json` | 0.006 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/wrap-report.2026-05-31T07-23-45-199Z.json` | 0.006 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/triage-results.json.items.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/qdrant-postgres-mirror-reconciliation.json` | 0.006 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-cards/memory-docs.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tsconfig.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `data/external-docs/chunks/cuda.jsonl` | 0.006 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/compressed-semantic-geometry-report.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/ace/packet-756c9e51a9ee9c74d7ff780a53e7a66bccf40c0cb0432a0d749e9f874a70f858.json` | 0.006 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/ace/packet-52ce38b07b52885e20f83afaee495920a3979f2339d2822236bb4ec86de8186e.json` | 0.006 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/extracted-patterns/bits-ui-extracted.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/bits-ui-extracted.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/training-datasets/graphify-deep-grpo.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/training-datasets/active-sample-2026-06-03T02-47-51-363Z.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/training-datasets/active-sample-2026-06-03T02-38-17-804Z.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/training-datasets/active-sample-2026-05-30T17-47-20-058Z.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/patterns.json` | 0.006 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-02-22T00-49-46/report.json` | 0.006 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-02-22T00-49-32/report.json` | 0.006 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-02-22T00-35-12/report.json` | 0.006 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-02-21T21-06-55/report.json` | 0.006 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-02-21T20-52-49/report.json` | 0.006 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-11T03-27-27/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-51/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-03T15-49-43/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-19-54/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-18-43/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-13/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-12-06/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-35-01/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/eval/data/labeled_queries.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T08-33-59/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-17-33/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-15-45/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-07-17/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-05-46/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T06-00-23/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-59-03/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/pa_constitution.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-47-57/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-46-36/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-40-05/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T05-38-52/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-15-48/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-14-58/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-11-06/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T04-09-19/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-17-36/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-16-15/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-01-53/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T02-00-27/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-26/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-09-00/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-07-15/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-24-30/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T13-23-31/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-18-05/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-17-08/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-00-02/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T20-59-02/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-37-24/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-36-07/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-17-52/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-16-53/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-06-54/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-05-28/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-33-50/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-30-24/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-24-07/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-19-55/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-15-49/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T20-14-54/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-49/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-24-02/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-15-45/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-14-59/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-10-45/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-09-56/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-05-17/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T17-04-24/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-59-44/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-58-52/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-54-38/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-53-53/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T16-05-51/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-45-53/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-44-23/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-43-52/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-40-55/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-28-36/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-27-34/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-24-39/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-22-43/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-57/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-57-05/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-45-13/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-44-19/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-31-18/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-30-23/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-25-25/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-23-56/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-58/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-54-07/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-57/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-46-02/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-42-53/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-54/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-41-01/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-39-25/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-34-44/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-33-51/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-30-37/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T05-29-33/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-27-03/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T01-26-59/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/ace_hit_relationships.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/kb/lane-router-training-set.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-47-36/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-44-14/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-40-45/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-39-46/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-00-48/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-08/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-02/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-14-40/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-46/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-18/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-06/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-03/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-07-59/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-30/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-05/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-59-42/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-53-22/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-52-31/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-34/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-24/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-45-52/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-33-56/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-20/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-15/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-26-55/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-24-29/ingest.jsonl` | 0.006 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-56/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-17-06/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-13-19/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-11-51/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-09-00/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-08-31/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-07-29/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-06-18/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-02-09/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-01-36/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-56-22/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-55-50/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T14-55-56/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-42-15/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-41-43/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-49/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-12-17/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-08-12/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-07-52/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-05-35/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T09-04-38/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-56-03/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-48-10/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T06-47-46/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-5-4.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-4-1.json` | 0.006 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-29/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-11-51/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-03-59/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-24/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-41-09/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-46-33/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-39/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-40-07/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-45-33/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-33-38/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-22-48/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-08-08/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-21-48/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-06-12/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-19-09/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T05-05-54/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-18-50/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/ace_hit_relationships.json` | 0.006 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/typescript-promotion-bridge-audit.json` | 0.005 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `.tmp/analysis/userid-columns.json` | 0.005 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/retrieval-pass-dry-run.ndjson` | 0.005 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/unwrapped/wrap-report.2026-05-31T07-23-45-199Z.json.items.jsonl` | 0.005 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/evidence-patterns.jsonl.report.json` | 0.005 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/lanes/audit.ndjson` | 0.005 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/empty-summary-examples.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/chr97-kanban-tasks.jsonl` | 0.005 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/atlas-cards/services-simd-bridge.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tsconfig.check.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/sveltekit-frontend/package-lock.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/models/piper-en-us.onnx.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `data/external-docs/chunks/webgpu.jsonl` | 0.005 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `data/external-docs/chunks/typescript.jsonl` | 0.005 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `data/external-docs/chunks/sveltekit.jsonl` | 0.005 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `data/external-docs/chunks/svelte.jsonl` | 0.005 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `data/external-docs/chunks/postgres.jsonl` | 0.005 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `data/external-docs/chunks/nodejs.jsonl` | 0.005 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/graph/atlas-write-scale-report.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/kanban-ranking-report.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/graph-refresh-manifest.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/atlas-completion-report.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/phase-lane-completion.json` | 0.005 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-atlas-write-scale-report.json` | 0.005 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/audits/latest-audit-summary.json` | 0.005 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/.tmp/audits/archive/latest-audit-summary-20260516-214237.json` | 0.005 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/.tmp/audits/archive/latest-audit-summary-20260516-214014.json` | 0.005 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/drizzle/meta/_journal.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/live-db-table-policy.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/phantom-commas-fix-report.json` | 0.005 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/leading-comma-fix-round2-report.json` | 0.005 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/error-count-results.json` | 0.005 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/attribute-comma-fix-report.json` | 0.005 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_lib_server_ace_context-assembler.ts.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/sc_constitution.jsonl` | 0.005 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-11-51/turboquant_stability.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/e870726bee49.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/be4815e3a2cf.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/843b9cc1eb57.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/417c2d2fd32d.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T14-55-56/turboquant_stability.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-11-51/synthesis_summary.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-03-59/synthesis_summary.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/synthesis_summary.json` | 0.005 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.claude/mcp.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ace-graph-builder-discovery.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/unwrap-report.2026-05-31T07-31-42-685Z.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/rag-context.jsonl.report.json.items.jsonl` | 0.004 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/legal-keywords.jsonl.items.jsonl` | 0.004 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/unwrapped/evidence-patterns.jsonl.report.json.items.jsonl` | 0.004 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/entity-patterns.jsonl.wrap-backup.2026-05-31T07-23-45-141Z.items.jsonl` | 0.004 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/triage-results.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/rag-context.jsonl.report.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/production-no-qdrant-ingest-report.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/phase19c_qdrant/atlas-reward-attribution.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/phase19c/atlas-reward-attribution.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/phase19b-cache-config-join-debug.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/phase-lane-completion.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/intent-cache-manifest.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/edges/audit_edges.ndjson` | 0.004 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ast-resolution-summary.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/training-datasets/entity-patterns.jsonl` | 0.004 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/tmp/uscode-extracted/parsed-statutes.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/workstation-soak-report.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/sourceRef-first-join-warmup.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/sourceRef-atlas-join-inventory.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/pgvector-audit-report.json` | 0.004 | `binary_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `docs/phase100/nes-multihop-cold-archive-pipeline.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/repo-engram-memory-report.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/programming-doc-feature-gap-report.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/reconstruction/demo-scene-intent.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/reconstruction/demo-crime-scene.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/graphify-intelligence-manifest.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/audit-schema-drift.snapshot.json` | 0.004 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T03-11-12/lane1-retrieval.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/pipeline-events.jsonl` | 0.004 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/manifests/packet-index.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/vector64-dryrun-report.json` | 0.004 | `binary_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `memory/exports/karpathy-qdrant-misses.jsonl` | 0.004 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/exports/cluster-attribution-report.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/agent-runs/current-corpus-promotion-preflight.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/promotion-status.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-engram-memory-report.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-programming-doc-feature-gap-report.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/mega-audit/chunk3-storage-integrity.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/mcp-sidecar-transport-fix-report.json` | 0.004 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/config/startup-ace-policy.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/typescript-advanced.jsonl` | 0.004 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/sveltekit-api.jsonl` | 0.004 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/python-async.jsonl` | 0.004 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/fullstack-integration.jsonl` | 0.004 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-analysis.json` | 0.004 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/corrupted-arrows-fix-report.json` | 0.004 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/duckdb-summary-card-report.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/atlas-index/feature-gap-registry.seed.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/agent-investigate-results/database-1772420994470.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/agent-investigate-results/database-1772420948554.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/audit_failures.json` | 0.004 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-26/audit_failures.json` | 0.004 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-09-00/audit_failures.json` | 0.004 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T01-05-54/ingest.jsonl` | 0.004 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-04/ingest.jsonl` | 0.004 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-01/ingest.jsonl` | 0.004 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/graphify/gds/gds-enrichment-report.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-01-36/synthesis_summary.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-56-22/synthesis_summary.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-9-3.json` | 0.004 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-3-2.json` | 0.004 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-2-5.json` | 0.004 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-0-4.json` | 0.004 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-0-3.json` | 0.004 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agent-runs/latest-recovery.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-46-33/synthesis_summary.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-22-48/synthesis_summary.json` | 0.004 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `atlas.config.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/vendor-quarantine-report.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/alias-id-migration-preflight-report.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/agentic-rag-preview.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/retrieval-replay-queries.jsonl` | 0.003 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/rerank-diff.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/unwrap-report.2026-05-31T07-32-37-347Z.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/unwrap-report.2026-05-31T07-32-17-544Z.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/extensions.json.report.json.items.jsonl` | 0.003 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/extensions.json.report.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/build_config_int4.json.report.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/phase19c_qdrant/atlas-training-dataset.jsonl` | 0.003 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/phase19c/atlas-training-dataset.jsonl` | 0.003 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/phase19b-join-key-discovery-rerun.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/phase19b-join-key-discovery-manual-rerun.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent-atlas-reprocessing-discovery.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/multi-hop-traversal-report.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/knowledge-consolidation-claim-check.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/cluster_summary.parquet` | 0.003 | `parquet_snapshot` | ❌ No | `cold` | `cold_archive` |
| `.tmp/gpu-stack-alignment-before.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/gpu-bridge-probe.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/duckdb-source-ref-audit-2026-06-02.json` | 0.003 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `.tmp/backfill-qdrant-source-refs-2026-06-04.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/backfill-qdrant-source-refs-2026-06-03.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-snapshot-2026-05-30T06-03-44-534Z.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-cards/sveltekit-frontend.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-cards/opencode.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-cards/models.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/top50.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tmp/task-distillates-v2.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/dev-graphs/validation/latest.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/dev-graphs/validation/history.ndjson` | 0.003 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/sourceRef-first-nes-glyph-compress.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/sourceRef-first-hot-join-warmup.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/pytorch-qdrant-redis-som-index-2026-06-01.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/lane-routing-eval.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/gitignored-folder-summary-2026-06-01.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/dev-service-health-report.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/concept-temperatures.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/concept-temperature-report.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/repo-workspace-map.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/programming-doc-sources.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/data/phase82-route-consolidation.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/patterns-corruption.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T03-13-21/lane1-retrieval.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T02-42-37/lane1-retrieval.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-41-49/lane1-retrieval.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-39-33/lane1-retrieval.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-39-05/lane1-retrieval.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-06_d6731bcc74.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-06_88f3dc9f8c.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-06_6b13bc2bef.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-06_578beeedc5.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/deep-audit/encoded/d9-vs-next-steps_2026-05-05_c329b0d6ef.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/recommendations.example.jsonl` | 0.003 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/PACKAGE_SCRIPTS_SNIPPET.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/vector64-compression-metrics.json` | 0.003 | `binary_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `memory/exports/lineage-chr97-validation.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/drizzle-user-id-drift.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/chr97-eval-report.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/datasets/llm_synthesis/2026-05-25.jsonl` | 0.003 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-batch-gpu-analysis-report.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-workspace-map.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-programming-doc-sources.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/bounded-promotion-queue-setup-report.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/atlas-gate4-live-checks.json` | 0.003 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/sidecar-audit-validated.json` | 0.003 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets-old/entity-patterns.jsonl` | 0.003 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/tests/vlm-tests/infra_status.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-18T01-12-20/report.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-18T01-11-27/report.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/css-newline-semicolon-report.json` | 0.003 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/component-analysis-report.json` | 0.003 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/retrieval-fusion-report.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/parent-atlas-overlay-sync-report.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_routes_api_sse_chat_+server.ts.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_routes_api_evidence_upload_+server.ts.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_routes_(app)_persons-of-interest_+page.svelte.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_routes_(app)_legal-corpus_[id]_+page.svelte.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_routes_(app)_global-search_+page.svelte.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_routes_(app)_dashboard_+page.svelte.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_routes_(app)_cases_[id]_board_+page.svelte.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_routes_(app)_admin_search-intelligence_+page.svelte.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_routes_(app)_admin_all-routes_+page.svelte.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_mcp_trace-mcp-server.ts.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_lib_server_queue_rabbitmq-manager-fixed.ts.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_lib_server_ai_gemma4-agent.ts.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_lib_components_evidence_EvidenceBoard.svelte.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-23-34/report.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-21-29/report.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-21-09/report.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/batch-gpu-analysis-report.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-06T17-02-55/report.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/agent-investigate-results/todo-1772420992326.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/agent-investigate-results/todo-1772420966047.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/agent-investigate-results/todo-1772420946367.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/agent-investigate-results/ml-1772420996809.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/agent-investigate-results/ml-1772420950726.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/agent-investigate-results/infra-1772421001099.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/agent-investigate-results/infra-1772420955031.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/agent-investigate-results/api-1772420998940.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/agent-investigate-results/api-1772420952870.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-11T03-27-26/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/mt_constitution.jsonl` | 0.003 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/me_constitution.jsonl` | 0.003 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/md_constitution.jsonl` | 0.003 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/id_constitution.jsonl` | 0.003 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/case_data/_cache/verbal_contracts_e3da00b9.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_dfb81e73.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_d83aca0c.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_d394c881.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_b877f369.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_ac540af6.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_93dc0f85.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_8cbef4ff.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_87f4c50b.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_84fe0da8.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_7283787a.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_6bae0739.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_5abb3be1.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_47eb3a47.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_40f8e671.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_33002210.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_2c4679c1.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_1f6b77b5.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_1255904f.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/verbal_contracts_0e7fc453.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_ee9dba00.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_ee8a500f.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_e8195be3.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_d0259d74.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_cf8335b5.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_c7c8017e.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_ae3cd375.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_a895dceb.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_a1e766f9.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_99511091.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_70d62dec.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_62c6ec44.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_57b1b527.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_54886178.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_43768597.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_4283af7a.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_3de28695.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_2591b9fc.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_09f0139c.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/tort_federal_06340152.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_ed73f935.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_e4254fd6.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_e184a39f.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_daa4be56.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_d832303b.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_c0408102.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_a70aaf16.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_9c007cc9.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_998456d7.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_7444635c.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_6e122ece.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_6b90ff25.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_579116c6.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_565219d5.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_50e9c191.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_4f8eb64d.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_4ade3fe2.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_26926278.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_16eb5031.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_e706e96e.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_e3e407c9.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_dc2872a5.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_cdb0be08.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_be9c7168.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_ab5e30d7.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_9f20080b.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_8d0778c0.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_8976cca2.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_70614f3c.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_6d9d756a.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_60916372.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_5478b452.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_3b9ac2b9.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_23b7d690.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_1cf8c4fd.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_1be5062d.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_14fe4117.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_0f0eb951.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/federal_employee_liability_0d535a85.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_e79397a1.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_e651a3cd.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_d1dde22a.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_ce81b754.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_b9522711.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_10a973a2.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_f167d865.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_d1b772a9.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_be7a1aba.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_b6b647b8.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_aede225a.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_accc2bc9.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_a605fbc1.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_a104576a.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_957bcb73.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_9028ddda.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_75ef11c6.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_736ff87b.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_6064aa74.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_5995e0d2.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_34c63437.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_306b3912.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_2f259a49.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_2418175f.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_229605f2.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/cybercrime_224af4f0.json` | 0.003 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/synthesis_summary.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-26/synthesis_summary.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-25/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-09-00/synthesis_summary.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/synthesis_summary.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/audit_failures.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/synthesis_summary.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/audit_failures.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/atlas/out/intent-graph.json` | 0.003 | `json_document` | ✅ Yes (rule: `[Oo]ut/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/agents_scope_map.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/01cb725b540e/ingest.jsonl` | 0.003 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/reconstruction/demo-scene-metadata.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T14-55-56/synthesis_summary.json` | 0.003 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/index.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-5-7.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-1-8.json` | 0.003 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/unresolved-lib-samples.jsonl` | 0.002 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/ace-graph-export-recovery-next-command.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ace-graph-builder-import-check.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/tagging-parameters.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/superseded-score-implementation-report.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/simd-parser-benchmark.large.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/simd-parser-benchmark.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/simd-parser-benchmark.before-mutex-fix.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/simd-parser-benchmark.before-after.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/semantic-api-tags-report.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/unwrap-report.2026-05-31T07-37-01-638Z.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/build_config_int4.json.report.json.items.jsonl` | 0.002 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/ui-history.jsonl.report.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/qdrant-som-centroid-backfill-report.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/phase19b-cache-config-candidate-review.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/owner-column-drift-couchdb.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/knowledge-card-validation.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/lanes/workspace.ndjson` | 0.002 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/h6-retrieval-status.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/h4-fp16-cleanup-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/gpu-lanes-smoke.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/gpu-capabilities-audit.json` | 0.002 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `.tmp/gemma4-parent-atlas-summary-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/drift-v3-couchdb.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/drift-couchdb.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/drift-corrected-couchdb.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/docs-gate-update-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/codebase-feature-map.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/cmake-native-symbol-audit.json` | 0.002 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `.tmp/check-dirs.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/backfill-qdrant-source-refs-2026-06-02.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-lane-health-loop.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-cards/tests-audits.json` | 0.002 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `.tmp/atlas-cards/scripts.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-cards/infrastructure.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-cards/drizzle.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `tsconfig.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/training-datasets/forensic-patterns.jsonl` | 0.002 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/top20_post_fix.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tmp/ace-context-snapshots/smoke-context-pack-v1.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/svelte-errors-new.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `granite-docling-258M/config.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docker/bifrost/config.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/workstation-soak-history.jsonl` | 0.002 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/trace-full-loop-smoke-report-2026-05-20.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/topology-mirror-repair-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/startup-health-trace-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/sourceRef-first-parent-atlas-refresh.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/sibling-inference-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/repo-consolidation-feature-map.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/preflight-operator-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/postgres-17-18-schema-audit.json` | 0.002 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `docs/reports/parent-atlas-feature-command-atlas-qdrant.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/parent-atlas-feature-command-atlas-postgres.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/nes-chrom-packet-recent-hits.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/nes-chrom-backfill-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/multihop-traversal-class-matrix.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/live-service-env-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/hidden-surface-registry.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/sveltekit-frontend_src_lib_server_ace_context-assembler.ts.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/codebase-feature-map.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/atlas/retry-queries.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/schemas/tools/scan-repo.schema.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/schemas/tools/llm-log.schema.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/schemas/tools/langextract-batch.schema.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/schemas/tools/kb-search.schema.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/schemas/tools/crawl-docs.schema.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/schemas/tools/cluster-tag.schema.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/schemas/tools/chunk-embed.schema.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/tests/bifrost-boundary-baseline.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/phase104-results.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/batch-fix-results.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-12T07-53-27/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-45-56/lane3-rerank.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-55-47/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-37-58/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-37-41/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-36-44/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-31-09/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-15-53/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-10-13/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-58-21/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-58-13/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-43-00/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-37-55/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-35-06/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-33-12/lane1-retrieval.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/package-clean.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/packets/atlas-packet-summary.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/knowledge/index-gap-memory-manifest.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/knowledge/document-knowledge-synthesis-manifest.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/knowledge/document-knowledge-embed-manifest.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/mcp-health-probe.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/lora-dataset-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/lineage-validation.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/chr97-k-sweep-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/backfill-code-cards-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-cluster-aliases.json` | 0.002 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `scratch/agent_rules_update.json` | 0.002 | `json_document` | ✅ Yes (rule: `scratch/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/asconfig.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.claude/settings.local.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/CMakePresets.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/meta_backup_20260101/_journal.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/phase77-metadata.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/vlm-tests/vlm_result.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/glossary/report.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/zero-percent-targeted-report.json` | 0.002 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/top-svelte-errors.json` | 0.002 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/syntax-errors-report.json` | 0.002 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/phase78-patches.json` | 0.002 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/bits-ui-migration-report.json` | 0.002 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-17T04-16-10/report.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/retrieval-telemetry-summary.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/opencode-agent-environment-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/live-service-env-audit.json` | 0.002 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/docs/reports/compression-quality-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_routes_(app)_analytics_+page.svelte.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_mcp_server.ts.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_lib_server_db_schema-postgres.ts.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_lib_server_atlas_route-feature-map.ts.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_lib_components_analysis_AnalysisPanel.svelte.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/obsidian-vault/agent-manifest.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/cluster-aliases.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/cluster-cards.schema.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/redis-load-test-report.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-11T03-27-26/relationship_map.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/fix-data.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/va_constitution.jsonl` | 0.002 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/or_constitution.jsonl` | 0.002 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/oh_constitution.jsonl` | 0.002 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/nd_constitution.jsonl` | 0.002 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/mi_constitution.jsonl` | 0.002 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/il_constitution.jsonl` | 0.002 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/fetch_report_20260324_154910.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/court_data/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/ct_constitution.jsonl` | 0.002 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/co_constitution.jsonl` | 0.002 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/case_data/_cache/wire_fraud_fb292fa1.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/wire_fraud_cf69f753.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/wire_fraud_94f160b2.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/wire_fraud_4fa27769.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/wire_fraud_3298f213.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/wire_fraud_04a40c94.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/obstruction_49c3cbf3.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_ef12028d.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_e586ec54.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_df9e865d.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_c802a8a8.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_c3d6710d.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_ad5b0aab.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_acc5a0a5.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_93469511.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_8a85ae62.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_6c693a48.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_60398902.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_5dc497a5.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_5b82c7a2.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_552a1869.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_515eebab.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_3de90df6.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_2f77db79.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_1ba941b5.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_13107b9c.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/firearms_113d375d.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_ff52f744.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_e883d0f1.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_ce7aac97.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_ca5a0b14.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_c3ab21d7.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_a96e24f9.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_8eea32c4.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_73e8a727.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_692fbbf6.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_5070a297.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_41bba536.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_3e35ce00.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_10588d2e.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `scripts/case_data/_cache/drug_trafficking_066aa61e.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/case_data/_cache/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/authority_scores.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-25/relationship_map.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/synthesis_summary.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-18-05/synthesis_summary.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/synthesis_summary.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-00-02/synthesis_summary.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-37-24/synthesis_summary.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/atlas/out/mutation-ledger.json` | 0.002 | `json_document` | ✅ Yes (rule: `[Oo]ut/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/synthesis_summary.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/synthesis_summary.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-17-52/synthesis_summary.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-28-36/synthesis_summary.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-31-18/synthesis_summary.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/synthesis_summary.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/authority_scores.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07-17-03-48/authority_scores.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07-17-00-51/authority_scores.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-59/authority_scores.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-14/relationship_map.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07-16-59-57/authority_scores.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-03-16/relationship_map.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07-16-44-09/authority_scores.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07-16-42-38/authority_scores.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07-16-41-16/authority_scores.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/reconstruction/aesthetic-presets.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-31/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-08-11/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-07-10/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T04-00-48/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-08/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-28-02/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-14-40/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-46/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-18/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-06/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-08-03/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-07-59/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-30/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T03-00-05/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-59-42/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-53-22/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-52-31/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-34/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-47-24/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-45-52/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-33-56/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-20/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-28-15/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-26-55/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-24-29/ace_hit_relationships.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-8-1.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-6-0.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-5-3.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-4-4.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-3-5.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-2-0.json` | 0.002 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/mcp.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/synthesis_summary.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/authority_scores.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/audit_failures.json` | 0.002 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/authority_scores.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/authority_scores.json` | 0.002 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/analysis_reports/case_audit_1774397617.json` | 0.002 | `json_document` | ✅ Yes (rule: `scripts/analysis_reports/`) | `cold` | `ignore_generated` |
| `.mcp.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `uuid_aliases.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/utf8-dump-conversion-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/top-others.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage-debug/20260520-190257/vitest-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage-debug/20260520-190257/ranked-failures.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage/20260520-185335/vitest-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage/20260520-185335/ranked-failures.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/alias-id-readiness.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ace-quarantine-scan-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage/20260520-185317/vitest-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage/20260520-185317/ranked-failures.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/taskboard-parent-atlas-sync.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/task-summaries-2026-06-03.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/sourceRef-first-nes-glyph-packets.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `msgpack_ingest` |
| `.tmp/sample.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/unwrap-report.2026-05-31T07-37-16-801Z.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/unwrap-report.2026-05-31T07-36-16-025Z.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/ui-history.jsonl.report.json.items.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/ui-history.jsonl.items.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/unwrapped/forensic-patterns.jsonl.report.json.items.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/extract-json-like.2026-05-31T07-37-42-128Z.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/entity-patterns.jsonl.items.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/forensic-patterns.jsonl.report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/qdrant-index-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/python-env-check.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/promote-to-postgres-dry-run.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/parent-atlas-packets.manifest.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/041740ea3ae30f09995b851e51952d86eeaff849d90fbadb146a88808c9e7f5f.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03b1487624dc44df551802189166f98c7ee144e788da833b2e90089f3ddc91c7.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/037c8a4625b2e92e4ec9b6fd00c535763954ecdc0fc4efde3a6b687f47854a06.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/03573452b4dcbba8fb27bdc1a86b46d85d7eab468a70240caec006437cb88cc8.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0352bbdf5b26135f4f78d40444f1cd72e20383ba1968474cf965970fff259998.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/031f77a032b1f043a10fd01d04c88ebc57d6541b9448ce5be088f98b766cca16.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/030f6b1d5efb83a15c5ceb05ab376d1344cb02581efa23dfafa53ab3f5fc9bae.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/02cdc812cf029cc17002362558bfc61df627a27351cc849828a1ebc48474f279.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/023f8c23db09d5a9c9dc0dbfe519baf38438f072e33551e9a9dd1c85cfa55e14.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/0220e02ae163c46c8c9c91f2a41bcc1d1db00dbc1b41ae11f58ce1431165cb30.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/021b3f4a1be02d27b32140244b3cbfb67ff1affff7dcc23a4275d6bec051bcfc.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/021770efc83dae68a24b0a71472cf78cae90d45711a4189171f24497d037dbed.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01e7ac3d6b278ca3d99f51cd0ba627f5311f94b8267048859b393f173b51de69.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01d723d47ec69c8e14f8eae48bdafdef77632337a5b5c7450593c50ad03ada0e.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/01319072d7ae35fa66f718d3588536753e17465995467e266798d453b7b075c8.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00d38a43f22a680216ca67fd5b6436b5119b14c271aee83b25daeab7d6a7e7ea.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/006f397af16dc46eb829ebca402fd9d511dd83b0c523b8f1c7756a83556068d9.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/004eee877ddb6e9f3722e76db2c5fcc6e60f8cc9256c1f4df0bcbcce6b9be973.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00450ce6c8c5e6aca98fb9370729e2db2cbcfd58c0e33846ea7b1fae3b4cc01e.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/00371659939c74d21335789efbd6dc5afb7ee74db4309d2e7c1111b4e06c263a.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent_atlas_packets/002571a5d702b1061240e2c1ec6ecccdac9f216fc8949602651be1ddd56211ea.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent-atlas-postgres-lineage-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/pack_msgpack_report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/p2-gates-closed.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/offline-synthesis-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/offline-synthesis/consolidated-index.ndjson.manifest.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/neo4j-sync-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/multihop-contextual-tree-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/mcp-health-status.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/mapreduce-test.ndjson.manifest.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/mapreduce-full.ndjson.manifest.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/mapreduce-full-v4.ndjson.manifest.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/mapreduce-full-v3.ndjson.manifest.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/mapreduce-full-v2.ndjson.manifest.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/key-dirs.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/json-parse-bench.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/lane_summary.parquet` | 0.001 | `parquet_snapshot` | ❌ No | `cold` | `cold_archive` |
| `.tmp/ingest/lanes/outcome.ndjson` | 0.001 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/gemma4-fixes.ndjson` | 0.001 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/edges.ndjson` | 0.001 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/edges/outcome_edges.ndjson` | 0.001 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/edges/codebase_features_edges.ndjson` | 0.001 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/hidden_directory_tasks.jsonl` | 0.001 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/gpu-stack-alignment-audit.json` | 0.001 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `.tmp/gpu-stack-alignment-after.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/couchdb-archive-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/claude-mem-ensure.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/bifrost-trace-smoke.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-component-qdrant-index-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/compression.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `tmp/ace-context-snapshots/test-1779737486075.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `tmp/ace-context-snapshots/test-1779736777093.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/turbovec-feature-manifest.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tsconfig.frontend.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/training-datasets/schema-patterns.jsonl` | 0.001 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/tests/reports/svelte-check-baseline-jan29-2026.json` | 0.001 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/tests/reports/e2e-test-status-jan29-2026.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tests/fixtures/intent-eval.jsonl` | 0.001 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/svelte-errors.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/models/embeddinggemma_300m_onnx/special_tokens_map.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/models/embeddinggemma_300m_onnx/config.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/gemma3_270m_onnx/special_tokens_map.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/embeddinggemma_300m_onnx/special_tokens_map.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/embeddinggemma_300m_onnx/config.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `granite-docling-258M/special_tokens_map.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docker/seaweedfs/s3.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `CMakePresets.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/workstation-observability-state.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/vram-recovery-smoke-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/sveltekit-form-contracts-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/source-ref-convergence-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/seaweedfs-manifest.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/rg-search-dump-index-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/qlora_distillation_report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/production-qdrant-no-som-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/parent-atlas-cypher-apply-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/packet-temperature-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/offline-synthesis-mapreduce-duckdb-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/inference-backend-benchmark.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/hermes-self-healing-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/gpu-som-pipeline-2026-06-08.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/gpu-som-pipeline-2026-06-03.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/gpu-job-queue-smoke-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/embed-head-to-head-runtime-2026-06-04.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/couchdb-ingest-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/compact-cache-prewarm-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/sveltekit-frontend_src_routes_(app)_cases_[id]_board_+page.svelte.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/sveltekit-frontend_src_routes_(app)_admin_search-intelligence_+page.svelte.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/sveltekit-frontend_src_mcp_trace-mcp-server.ts.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/sveltekit-frontend_src_mcp_server.ts.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/sveltekit-frontend_src_lib_server_db_schema-postgres.ts.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/sveltekit-frontend_src_lib_server_atlas_route-feature-map.ts.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/scripts_tests_screenshots_2026-04-06T06-27-46_report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/scripts_memory_graphify_gds_adb7a6419a31.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/scripts_memory_graphify_gds_98714cf0f2af.json.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/scripts_memory_graphify_gds_98714cf0f2af.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/scripts_memory_graphify_gds_7c2d269cb33c.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/scripts_memory_graphify_gds_76047e144058.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/scripts_memory_graphify_gds_5cabb44eb71f.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/scripts_memory_graphify_gds_5565949d4470.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/scripts_memory_graphify_gds_0c8dde4166f9.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/scripts_api-cleanup_reports_cleanup-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/next_steps_active_SCHEMA_MANIFEST.json.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/next_steps_active_SCHEMA_MANIFEST.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/docker_langgraph-synthesis_.venv_Lib_site-packages_plotly_validators__validators.json.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/docker_langgraph-synthesis_.venv_Lib_site-packages_plotly_validators__validators.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/docker_langgraph-synthesis_.venv_Lib_site-packages_plotly_package_data_widgetbundle.js.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/profile-cards/data/docker_langgraph-synthesis_.venv_Lib_site-packages_plotly_package_data_plotly.min.js.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/phase100/feature-recommendations.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/phase100/consolidation-recommendations.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/repo-redis-ace-cards.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/programming-docs-ingestion-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/missing-features-path-map.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/karpathy-synthesis-scale-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/atlas/parent-atlas.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `packages/parent-atlas/package.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `crates/turbovec-napi/package.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `crates/turbovec-napi/package-lock.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `crates/atlas_packet_parser/package.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `crates/atlas_packet_parser/package-lock.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/server/db/migrations/meta/_journal.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/schemas/tools/source-validation.schema.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/phase103-analysis.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/core-focus.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/comfyui/workflow_api.example.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/comfyui/workflows/dev-workflow-api.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-12T07-56-43/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-12T07-56-43/lane2-graph.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T03-13-21/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T03-11-12/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T02-42-37/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-47-55/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-46-47/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-41-52/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-41-33/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-37-35/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-37-08/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-10-42/lane4-synthesis.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-10-42/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-10-06/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-31-09/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-15-53/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-48-27/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-48-27/lane1-retrieval.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-43-00/lane3-rerank.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-32-06/lane1-retrieval.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-31-59/lane1-retrieval.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-28-37/lane1-retrieval.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-15-14/lane1-retrieval.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/rewards/tool-performance.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/rewards/sourceRef-performance.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/packets/atlas-packet-summary.parquet` | 0.001 | `parquet_snapshot` | ❌ No | `cold` | `cold_archive` |
| `memory/knowledge/schema-indexer-contract-manifest.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/sample-glyphs-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/reward-attribution-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/replay-validation.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/pg18-redis-bifrost-stack-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/parent-atlas-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/master-todo-consolidation-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/lora-dataset-stats.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/identity-completion-gate.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/gpu-enrich-parent-atlas-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/glyph-rewards-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/glyph-pairs-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/duckdb-mapreduce-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/cluster-summary.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/chr97-inject-engram-ace-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/chr97-grpo-export-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/all-lanes-parent-atlas-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/gemma3_270m/special_tokens_map.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/gemma3_270m/config.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/gemma3-client-onnx/special_tokens_map.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m_onnx/special_tokens_map.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m_onnx/config.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m/special_tokens_map.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m/modules.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m/config_sentence_transformers.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m/config.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/turbovec-rerank-smoke.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/config.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/som_training_manifest.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/retrieval-truth-lock-latest.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/redis8-eval-startup-status.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/phase17-pytorch-features.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/pack_msgpack_report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/offline-cuvs-task.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-graphify-health.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-redis-ace-cards.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-programming-docs-ingestion-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-karpathy-synthesis-scale-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/atlas-gate4-reasoning-loop-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/mega-audit/storage-touchpoints.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/mega-audit/dependency-map.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/mcp-sidecar-transport-audit.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/.tmp/jsonb_export.ndjson` | 0.001 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/hot-keyword-clusters.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/db_upsert_test_result.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/bifrost-trace.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/atlas-retrieval-loop.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/atlas-gate4-reasoning-loop-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/atlas-cartridge-seeds.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/atlas-cartridge-seed-meta.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/ace/packet-0530826d24087e7fc57b682e2c3e4f7f3e763b29f99c770e0645428774e6855e.json` | 0.001 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `reports/pytorch-workstation-artifact.json` | 0.001 | `json_document` | ✅ Yes (rule: `reports/*.json`) | `runtime-safe` | `keep_runtime` |
| `reports/hidden_directory_kanban.json` | 0.001 | `json_document` | ✅ Yes (rule: `reports/*.json`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/config.json` | 0.001 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets-old/forensic-patterns.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/tests/vlm-tests/text_test.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/latest/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/cases-ui/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-18T02-59-52/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/redis-mass-optimization-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/production-readiness-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/phase72-quick-test-vectors.json` | 0.001 | `binary_weights` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `gpu-turbovec` | `gpu_training_input` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/phase72-demo-results.json` | 0.001 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-17T04-17-15/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/agentic-demo-report.json` | 0.001 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/.phase72-plan.json` | 0.001 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-47-35/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-47-33/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-47-31/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-46-34/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-46-19/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-46-15/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-46-11/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-45-38/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/task-semantic-packet-latest.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/summary-card-lane-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/summary-card-error-list.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/som-coordinate-coverage-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/feature-card-offline-mirror-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/feature-card-duckdb-validation.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/feature-card-couchdb-design.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/engram-adapter-decision-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/bifrost-provider-ensure-latest.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/atlas-coverage-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-43-53/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-39-48/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-39-46/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-39-11/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-37-35/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-32-42/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-26-56/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/profile-cards/data/sveltekit-frontend_src_lib_server_db_meta_0000_snapshot.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-25-33/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-17-32/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-12T23-17-00/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-11T23-15-43/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/graphify-health.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-07T00-58-34/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/cluster-cards.example.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/tests/screenshots/2026-04-07T00-47-54/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-06T20-26-24/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-06T17-03-45/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-06T17-03-31/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `scripts/tests/screenshots/2026-04-06T07-29-27/report.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/tests/screenshots/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/mcp-multicore-config.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/opencode/audit_progress_observation.json` | 0.001 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/synthesis_summary.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/audit_failures.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/synthesis_summary.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/legal_calibration_data.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/synthesis_summary.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-19-54/synthesis_summary.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/synthesis_summary.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `scripts/custom_model_config.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/wy_constitution.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/fetch_report_20260324_155332.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/court_data/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/fetch_report_20260324_155329.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/court_data/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/fetch_report_20260324_154936.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/court_data/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/fetch_report_20260324_154805.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/court_data/`) | `runtime-safe` | `keep_runtime` |
| `scripts/court_data/constitutions/ca_constitution.jsonl` | 0.001 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-26/synthesis_grpo_wiring.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/synthesis_grpo_wiring.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/synthesis_grpo_wiring.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/audit_failures.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-18-05/audit_failures.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/audit_failures.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-00-02/audit_failures.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-37-24/audit_failures.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-17-52/audit_failures.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/synthesis_summary.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-59/synthesis_summary.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-12T19-48-04/mcp-stdio-smoke.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag_error_506389f1_2026-05-06T22-32-43/graph_hits.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag_error_506389f1_2026-05-06T22-32-43/error.summary.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag_error_506389f1_2026-05-06T22-32-43/context_packet.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag_error_2e53fd23_2026-05-06T22-34-56/graph_hits.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag_error_2e53fd23_2026-05-06T22-34-56/error.summary.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag_error_2e53fd23_2026-05-06T22-34-56/context_packet.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag-session-2026-05-06-windows-hardening/run.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag-session-2026-05-06/run.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/knowledge/gpu-batch-tasks.json` | 0.001 | `json_document` | ✅ Yes (rule: `gpu-*`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/kb/lane-router-eval-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-09T04-10-42/mcp-stdio-smoke.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-09T04-09-49/mcp-stdio-smoke.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-09T04-08-49/mcp-stdio-smoke.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/index/ast-summary.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/eccc40e4ee33.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/b9e5c21aa936.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/gds/a6fa350ee467.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/graphify/deep/graph-stats.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/exports/pg18-compat-report.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/exports/graph-refresh-manifest.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/exports/engram-transition-memory.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08T06-53-45/turboquant_stability.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-9-1.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-8-3.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-8-0.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-3-4.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-1-5.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-1-2.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-0-2.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-0-0.json` | 0.001 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-11-51/synthesis_grpo_wiring.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-11-51/gds_authority_install_trace.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-46-33/synthesis_grpo_wiring.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-22-48/nes_cartridge_metadata.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/synthesis_summary.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/synthesis_grpo_wiring.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/synthesis_grpo_wiring.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/gds_authority_coverage_trace.json` | 0.001 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/analysis_reports/licensing_report_1774397582.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/analysis_reports/`) | `runtime-safe` | `keep_runtime` |
| `scripts/analysis_reports/licensing_report_1774396511.json` | 0.001 | `json_document` | ✅ Yes (rule: `scripts/analysis_reports/`) | `runtime-safe` | `keep_runtime` |
| `.github/hooks/rg.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `audit/public-route-allowlist.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/verify_cache_output.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/valkey_verify.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/token-card-weights.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/test-ui-history.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/test-triage-debug/latest.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage-debug/20260520-190307/ranked-failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage/latest.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/test-triage/20260520-190405/ranked-failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/analysis/backfill-summary.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ace-startup-status.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/ace-packet-cache-manifest.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/subdomain-topology.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/source-ref-normalization-preview.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/simd-presets-test.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/simd-build-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/rg-search-dump-packets/rg-search-dump-packets.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `msgpack_ingest` |
| `.tmp/retrieval-outcome-summary.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/tasks-security-orchestrator.json.report.json.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/tasks-misc.json.report.json.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/schema-patterns.jsonl.report.json.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/schema-patterns.jsonl.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/unwrapped/production-config.json.report.json.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/perf_schema.json.report.json.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/matches_set.json.report.json.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/forensic-patterns.jsonl.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/unwrapped/entity-patterns.jsonl.wrap-backup.2026-05-31T07-23-45-141Z.items.jsonl.retry-extracted.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/unwrapped/entity-patterns.jsonl.report.json.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/emb-body.json.report.json.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/coordinated-build-system.json.report.json.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/config_fixed.json.report.json.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/unwrapped/cline-memory.jsonl.bak.json.items.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/repairs/tasks-security-orchestrator.json.report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/tasks-misc.json.report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/schema-patterns.jsonl.report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/production-config.json.report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/perf_schema.json.report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/matches_set.json.report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/entity-patterns.jsonl.report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/emb-body.json.report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/coordinated-build-system.json.report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/config_fixed.json.report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/repairs/cline-memory.jsonl.bak.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/redis-flavor-check.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/qdrant-upsert-dim-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/qdrant-dim-smoke.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/qdrant-collections.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/prune-junk-qdrant-chunks-2026-06-09.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/promote-to-postgres-apply.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/phase19b-manual-join-overrides.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/phase18-xgboost-rerank.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/phase17-pytorch-features.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/parent-atlas-validation.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/parent-atlas-state-export.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/normalize-sourcerefs-diff.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/missing_features_report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/missing_features_classified.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/missing-sourceref.ndjson` | 0.000 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/missing-embeddings.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/missing-embeddings-verbose.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/master-todo-reconciliation.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `.tmp/master-todo-kanban-tasks.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `.tmp/json-packet-integrity.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ingester-validation-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/ingest/test-tasks.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/tasks.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/task-proposals.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/lanes/language.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/gemma4-tasks.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/edges/workspace_edges.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/edges/route_edges.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/edges/language_edges.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/edges/import_edges.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/edges/env_edges.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ingest/edges/card_edges.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/idle-scanner-status.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/high-confidence-candidates.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/gpu-som-checkpoint/scroll_done.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/feature-registry.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/embedding-coverage-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/duckdb-mapreduce-join-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/drizzle-introspect/meta/_journal.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/dependency-summary.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/dependency-graph.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/claude-mem-sample.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/calls-summary.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-vector64-dataset.jsonl` | 0.000 | `binary_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `.tmp/atlas-training-dataset.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/atlas-reward-attribution.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-parent-join-readiness.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-packets-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `.tmp/atlas-component-qdrant-failures.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/atlas-cluster-assignments.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/atlas-cluster-assignments.1780110981204.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/atlas-cards-for-weights.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `.tmp/ast-topology-summary.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d3072_4bit_x86_st.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d3072_4bit_x86_mt.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d3072_4bit_arm_st.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d3072_4bit_arm_mt.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d3072_2bit_x86_st.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d3072_2bit_x86_mt.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d3072_2bit_arm_st.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d3072_2bit_arm_mt.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d1536_4bit_x86_st.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d1536_4bit_x86_mt.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d1536_4bit_arm_st.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d1536_4bit_arm_mt.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d1536_2bit_x86_st.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d1536_2bit_x86_mt.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d1536_2bit_arm_st.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/speed_d1536_2bit_arm_mt.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/recall_glove_4bit.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/recall_glove_2bit.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/recall_d3072_4bit.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/recall_d3072_2bit.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/recall_d1536_4bit.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `turbovec/benchmarks/results/recall_d1536_2bit.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `training-datasets/chr97-grpo-pairs-2026-05-31T08-57-30-765Z.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `tmp/ace-context-snapshots/local-test-tsc.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `test-results/.last-run.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/vcpkg.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/uploads/audio/test-audio.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/traverse-test.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tmp/qdrant-embeddings-test.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/tmp/checkpoint-codebase_chunks_10m.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tmp/ace-context-snapshots/local-test-tsc.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/tests/tsconfig.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/test-template-gen.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/test-results/.last-run.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/temp_batch_texts.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/template-ast-violations.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/sveltekit-frontend/sveltekit-frontend/package-lock.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/sveltekit-frontend/sveltekit-frontend/.tmp/scenario_pipeline_smoke.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/sveltekit-frontend/sveltekit-frontend/.tmp/db_upsert_report.dryrun.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/sveltekit-frontend/package.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/sveltekit-frontend/.tmp/som_training_pairs.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/sveltekit-frontend/.tmp/som_training_manifest.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/sveltekit-frontend/.tmp/atlas-component-profiles.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `sveltekit-frontend/sveltekit-frontend/.tmp/ace-startup-status.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/svelte-top100.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/models/embeddinggemma_300m_onnx/model_info.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/gemma3_270m_onnx/model_info.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/gemma3_270m_onnx/added_tokens.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/static/embeddinggemma_300m_onnx/model_info.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `indexing.config.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `granite-docling-258M/processor_config.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `granite-docling-258M/preprocessor_config.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `granite-docling-258M/generation_config.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `granite-docling-258M/added_tokens.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `feature-registry.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `drizzle/meta/_journal.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `data/couchdb-ingest-registry.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/vram-hygiene-smoke-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/sourceRef-first-parent-atlas-packets.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/sourceRef-context-neo4j-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/retrieval-comparison-smoke.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/production-no-qdrant-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/legacy-field-usage.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/hermes-self-healing-events.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `docs/reports/error-fix-dag-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/contract-error-map-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/cache-effectiveness.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/cache-effectiveness-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/atlas-feature-map-duckdb-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/reports/active-topology-mirror-backfill-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/phase100/feature-graph-cycles.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/repo-neo4j-graphrag-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/repo-language-map.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/contract-error-map.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/batch-gpu-analysis-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/graph/atlas-write-manifest.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/ai-os/atlas-retry-index.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `docs/ai-os/agentic-progress-log.ndjson` | 0.000 | `ndjson_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `packages/parent-atlas/tsconfig.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/mcp/zod-to-json-schema-bridge/package.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/server/db/meta/_journal.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/server/config/rerank-weights.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/src/lib/config/mcp-context7-registration.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/tsconfig.scripts.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/tests/screenshots/langgraph-subllms/test-results.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scripts/mcp-list-request.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/test.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-12T07-56-43/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-12T07-53-27/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-12T07-53-27/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-12T07-53-27/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T03-13-21/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T03-13-21/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T03-11-12/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T03-11-12/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T02-42-37/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T02-42-37/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-47-55/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-47-55/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-46-47/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-46-47/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-45-56/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-45-56/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-42-12/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-42-12/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-42-12/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-41-52/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-41-52/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-41-33/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-41-33/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-37-35/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-37-35/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-37-08/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-37-08/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-10-42/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-10-06/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-10-06/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-55-47/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-55-47/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-55-47/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-41-49/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-41-49/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-41-49/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-39-33/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-39-33/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-39-33/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-39-05/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-39-05/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-39-05/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-37-58/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-37-58/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-37-58/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-37-41/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-37-41/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-37-41/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-36-44/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-36-44/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-36-44/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-31-09/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-31-09/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-15-53/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-15-53/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-10-13/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-10-13/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-10-13/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-58-21/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-58-21/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-58-21/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-58-13/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-58-13/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-58-13/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-48-27/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-48-27/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-43-00/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-43-00/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-37-55/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-37-55/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-37-55/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-35-06/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-35-06/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-35-06/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-33-12/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-33-12/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-33-12/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-32-06/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-32-06/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-32-06/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-31-59/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-31-59/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-31-59/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-28-37/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-28-37/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-28-37/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-15-14/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-15-14/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-15-14/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T22-39-57/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T22-39-57/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T22-39-57/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T22-39-57/lane1-retrieval.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-52-33/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-52-33/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-52-33/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-52-33/lane1-retrieval.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-49-48/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-49-48/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-49-48/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-49-48/lane1-retrieval.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-23-55/lane4-synthesis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-23-55/lane3-rerank.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-23-55/lane2-graph.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-23-55/lane1-retrieval.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/mcp_request.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/scratch/mcp_list_request.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/batch-analysis-2026-05-26T22-11-59.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/batch-analysis-2026-05-26T22-11-55.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/batch-analysis-2026-05-26T22-09-41.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/batch-analysis-2026-05-26T22-05-14.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/batch-analysis-2026-05-26T21-55-15.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/reports/batch-analysis-2026-05-03T17-08-57.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/public/manifest.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/phase11-legal-mesh-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/normalized-errors.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/subagents/subagent-log.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/rewards/source-performance.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/rewards/cluster-performance.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/rewards/card-performance.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/packets/atlas-token-map.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/manifests/sample.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/manifests/artifact.manifest.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/knowledge/prune-candidates.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/knowledge/production-ready.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/knowledge/document-knowledge-manifest.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/knowledge/archive-candidates.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/exports/unified-ingester-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/temporal-append-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/som-packets-redis-load.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/reward-summary.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/qdrant-source-ref-hash-backfill.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/parent-atlas-redis-warmup.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/parent-atlas-couchdb-archive.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/gemma4-tasker-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/gemma4-error-fixer-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/chr97-kanban-emit-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/exports/atlas/sample_cards.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/exports/ace-packet-ingest-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/diagnostics/svelte-check-ranked.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/diagnostics/svelte-check-errors.jsonl` | 0.000 | `jsonl_dataset` | ❌ No | `cold` | `ldjson_batch` |
| `memory/clusters/graph_analysis_ready.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `memory/clusters/failure-clusters.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `mcp_tools.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `mcp_init.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/gemma3_270m/generation_config.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/gemma3_270m/added_tokens.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/gemma3-client-onnx/model_info.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/gemma3-client-onnx/added_tokens.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m_onnx/model_info.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m/sentence_bert_config.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m/generation_config.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m/added_tokens.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m/3_Dense/config.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m/2_Dense/config.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/embeddinggemma_300m/1_Pooling/config.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `models/config.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `minio-data/.minio.sys/format.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `storage/raft_state.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/shard_key_mapping.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/scenario_pipeline_smoke.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/scenario_index_report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/scenario-cache-flow-test.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/retrieval-truth-lock-gate-results.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/qdrant-upsert-dim-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/promotion-queue-run.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/phase18-xgboost-rerank.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `storage/collections/phase72_evidence_embeddings/0/shard_config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/gate3-synthesis-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-repo-neo4j-graphrag-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/fe-graph-llm-summaries.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-neo4j-graphrag-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-language-map.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-contract-error-map.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-batch-gpu-analysis-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/offline-analysis/docs-graph-atlas-write-manifest.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/missing_features_report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/missing_features_classified.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/d9446289-7f6d-42a1-9b3b-4c8ca52af487/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/mega-audit/route-service-map.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/mega-audit/feature-labels.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/jsonb_export_report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/d9446289-7f6d-42a1-9b3b-4c8ca52af487/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/ingest/lanes/test-lane.ndjson` | 0.000 | `ndjson_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/idle-scanner-status.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/graphify-daily-startup.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/gate3-synthesis-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/feature-map-startup-status.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/d9446289-7f6d-42a1-9b3b-4c8ca52af487/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/drizzle-introspect-v2/meta/_journal.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/consistency-audit-results.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/.tmp/autoresearch-sample.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `.tmp/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/.tmp/ace-top-retrieval-status.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/ace-startup-status.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/d9446289-7f6d-42a1-9b3b-4c8ca52af487/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/b4b382bc-5539-4e07-a84a-81965bb93842/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/b4b382bc-5539-4e07-a84a-81965bb93842/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.tmp/.tmp/db_upsert_report.dryrun.json` | 0.000 | `json_document` | ✅ Yes (rule: `.tmp/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/b4b382bc-5539-4e07-a84a-81965bb93842/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/b4b382bc-5539-4e07-a84a-81965bb93842/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `scratch/test-req.json` | 0.000 | `json_document` | ✅ Yes (rule: `scratch/`) | `runtime-safe` | `keep_runtime` |
| `scratch/probe_initialize.json` | 0.000 | `json_document` | ✅ Yes (rule: `scratch/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/a2bf68c0-57b5-4c95-b39a-c7ba4702b039/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/a2bf68c0-57b5-4c95-b39a-c7ba4702b039/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/a2bf68c0-57b5-4c95-b39a-c7ba4702b039/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `scratch/obsidian_vault/.obsidian/plugins/obsidian-local-rest-api/manifest.json` | 0.000 | `json_document` | ✅ Yes (rule: `scratch/`) | `runtime-safe` | `keep_runtime` |
| `scratch/mcp_tools.json` | 0.000 | `json_document` | ✅ Yes (rule: `scratch/`) | `runtime-safe` | `keep_runtime` |
| `scratch/mcp_request.json` | 0.000 | `json_document` | ✅ Yes (rule: `scratch/`) | `runtime-safe` | `keep_runtime` |
| `scratch/mcp_body.json` | 0.000 | `json_document` | ✅ Yes (rule: `scratch/`) | `runtime-safe` | `keep_runtime` |
| `scratch/config_fixed.json` | 0.000 | `json_document` | ✅ Yes (rule: `scratch/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/a2bf68c0-57b5-4c95-b39a-c7ba4702b039/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/raft_state.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/shard_key_mapping.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/8f665932-9edb-4846-92ae-f302ccfb9128/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/shard_config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/8f665932-9edb-4846-92ae-f302ccfb9128/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/dc2f23e6-bb9a-458c-8024-8170d5a8abf6/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/8f665932-9edb-4846-92ae-f302ccfb9128/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/dc2f23e6-bb9a-458c-8024-8170d5a8abf6/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/8f665932-9edb-4846-92ae-f302ccfb9128/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/dc2f23e6-bb9a-458c-8024-8170d5a8abf6/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/7ea73893-ecc1-4510-b8d3-439f194154c9/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/ast-scan-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/dc2f23e6-bb9a-458c-8024-8170d5a8abf6/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/7ea73893-ecc1-4510-b8d3-439f194154c9/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/7ea73893-ecc1-4510-b8d3-439f194154c9/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/b5db10f3-d54b-4f7b-b2f2-a50ddd817330/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/b5db10f3-d54b-4f7b-b2f2-a50ddd817330/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/7ea73893-ecc1-4510-b8d3-439f194154c9/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/b5db10f3-d54b-4f7b-b2f2-a50ddd817330/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/5a5530ac-757d-4299-928f-f00b49f7f73f/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/b5db10f3-d54b-4f7b-b2f2-a50ddd817330/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/5a5530ac-757d-4299-928f-f00b49f7f73f/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/3d506357-f0b6-46ba-8382-87d5f1faec13/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/5a5530ac-757d-4299-928f-f00b49f7f73f/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/any-type-fixes.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/3d506357-f0b6-46ba-8382-87d5f1faec13/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/5a5530ac-757d-4299-928f-f00b49f7f73f/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/3d506357-f0b6-46ba-8382-87d5f1faec13/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/18c5c3cb-00bd-4a54-9976-a8665dc0c689/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/1b01ebdc-a134-4c12-a17b-3ee0c20b0a92/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/3d506357-f0b6-46ba-8382-87d5f1faec13/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/18c5c3cb-00bd-4a54-9976-a8665dc0c689/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/1b01ebdc-a134-4c12-a17b-3ee0c20b0a92/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/3d4f0fd9-6e58-4be5-ad71-68d17695803d/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/18c5c3cb-00bd-4a54-9976-a8665dc0c689/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/1b01ebdc-a134-4c12-a17b-3ee0c20b0a92/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/3d4f0fd9-6e58-4be5-ad71-68d17695803d/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/aliases/data.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/18c5c3cb-00bd-4a54-9976-a8665dc0c689/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/replica_state.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/1b01ebdc-a134-4c12-a17b-3ee0c20b0a92/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/3d4f0fd9-6e58-4be5-ad71-68d17695803d/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/qdrant_storage/raft_state.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/qdrant_storage/aliases/data.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/2866ebd4-36a8-4382-b303-7dc508d3db05/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/2866ebd4-36a8-4382-b303-7dc508d3db05/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/08531908-d173-4569-a68f-c90a37187fc4/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/3d4f0fd9-6e58-4be5-ad71-68d17695803d/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/08531908-d173-4569-a68f-c90a37187fc4/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/2866ebd4-36a8-4382-b303-7dc508d3db05/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/2b244f9d-4121-4433-b8fd-83e1a62d8e8c/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/08531908-d173-4569-a68f-c90a37187fc4/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/2866ebd4-36a8-4382-b303-7dc508d3db05/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/2b244f9d-4121-4433-b8fd-83e1a62d8e8c/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/2b244f9d-4121-4433-b8fd-83e1a62d8e8c/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/aliases/data.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/247cce33-28b8-441c-9ad7-052b80f92aee/vector_storage/vectors/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/segments/08531908-d173-4569-a68f-c90a37187fc4/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `storage/collections/phase72_evidence_embeddings/0/replica_state.json` | 0.000 | `json_document` | ✅ Yes (rule: `/storage/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/247cce33-28b8-441c-9ad7-052b80f92aee/segment.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/2b244f9d-4121-4433-b8fd-83e1a62d8e8c/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/247cce33-28b8-441c-9ad7-052b80f92aee/payload_storage/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `qdrant-windows/storage/collections/legal_evidence/0/segments/247cce33-28b8-441c-9ad7-052b80f92aee/payload_index/config.json` | 0.000 | `json_document` | ✅ Yes (rule: `qdrant-windows/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/.port-allocation.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `simd-bridge/cpp/build-x64-fallback/CMakeFiles/InstallScripts.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `simd-bridge/cpp/build-x64-cuda-cuvs/CMakeFiles/InstallScripts.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `simd-bridge/cpp/build-x64-cuda-cuvs/CMakeFiles/CheckCUDA/CMakeFiles/InstallScripts.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `simd-bridge/cpp/build-x64-cuda-cublas/CMakeFiles/InstallScripts.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `simd-bridge/cpp/build-x64-cuda-cublas/CMakeFiles/CheckCUDA/CMakeFiles/InstallScripts.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `simd-bridge/cpp/build-x64-cuda/CMakeFiles/InstallScripts.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CheckCUDA/CMakeFiles/InstallScripts.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `simd-bridge/cpp/build-verify-2026-05-31T08-06-57-567Z/CMakeFiles/InstallScripts.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `simd-bridge/rust/hmm-repair/package.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `simd-bridge/rust/graph-engine/package.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/debug-events.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/unsloth-training/COLAB_PACKAGE/training-datasets-old/schema-patterns.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/tests/vlm-tests/sveltekit_vlm_result.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/test-feedback.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/test-diagnose.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/drizzle/introspected/meta/_journal.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/zero-percent-targeted-dry-run.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/zero-percent-fix-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/ternary-colons-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-errors.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-top100-errors.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/phase76-scripts.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/PHASE43-TOP-ERRORS.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/phase40-ast-results.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/phase34d-error-check.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/label-revert-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/error-normalization-summary.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/css-spacing-fix-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/css-fix-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/css-comma-fixes-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/batch-fix-results.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/batch-1000-results.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/async-fix-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/async-effect-report.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/ast-verification-summary.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/.error-patterns-cache.json` | 0.000 | `json_document` | ✅ Yes (rule: `sveltekit-frontend/docs_readme/deeds_labs_archive/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/task-semantic-packet-workflow-latest.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/neo4j-summary-card-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/neo4j-cards-write-latest.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/index-gap-memory-cards-pointer.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/couchdb-summary-card-snapshot.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/reports/cache-hit-protocol-lane-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/obsidian-vault/breadcrumbs.suggested.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/repo-neo4j-graphrag-report.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/docs/graph/llm-summaries.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/errors.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/errors-clean.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/synthesis/latest-handoff.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/synthesis/handoffs.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-27-10-629Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-27-09-658Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-27-07-954Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-27-06-904Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-27-06-466Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-27-06-245Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-27-02-691Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-27-02-659Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-27-02-542Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-27-00-566Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-26-56-955Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-26-55-390Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-26-54-660Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-simple-2026-03-03T04-26-54-267Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-results-2026-03-03T04-03-24-239Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-results-2026-03-03T04-03-19-040Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-results-2026-03-03T04-03-19-003Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-results-2026-03-03T04-03-18-901Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-results-2026-03-03T04-02-49-384Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-results-2026-03-03T04-02-46-229Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-results-2026-03-03T04-02-46-062Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/tests/performance-results/performance-results-2026-03-03T04-02-46-035Z.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-06/smoke-001/run.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/synthesis_grpo_wiring.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-06-01T22-22-15/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/synthesis_grpo_wiring.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-31T20-36-25/audit_failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/synthesis_grpo_wiring.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-30T20-02-16/audit_failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-19-54/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-30T17-19-54/audit_failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `scripts/graph-analysis-results.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/synthesis_grpo_wiring.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-29T15-30-49/audit_failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `scripts/court_data/courtlistener__scotus.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/wy_constitution_NEEDS_RENDERING.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/wa_constitution_NEEDS_RENDERING.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/tn_constitution_NEEDS_RENDERING.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/sd_constitution_NEEDS_RENDERING.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/ok_constitution_NEEDS_RENDERING.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/la_constitution_NEEDS_RENDERING.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/in_constitution_NEEDS_RENDERING.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/dc_constitution_NEEDS_RENDERING.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/ca_constitution_NEEDS_RENDERING.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/ar_constitution_NEEDS_RENDERING.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `scripts/court_data/constitutions/ak_constitution_NEEDS_RENDERING.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `scripts/court_data/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/authority_pipeline_trace.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-26T17-32-26/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-24T23-09-00/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-24T16-28-25/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-23T02-44-53/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/synthesis_grpo_wiring.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-22T01-44-37/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-21T22-18-05/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/synthesis_grpo_wiring.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-28-24/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-20T21-00-02/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-20T02-37-24/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `scripts/atlas/out/synthetic-trace-summary.json` | 0.000 | `json_document` | ✅ Yes (rule: `[Oo]ut/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-20/smoke-001/run.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/synthesis_grpo_wiring.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-19T19-10-37/audit_failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/synthesis_grpo_wiring.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-18T18-04-46/audit_failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `scripts/api-cleanup/reports/unfixable-analysis.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `scripts/api-cleanup/reports/disable-log.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T22-17-52/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-28-36/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-17T15-28-36/audit_failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-31-18/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-17T09-31-18/audit_failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/kb_training_data.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/synthesis_grpo_wiring.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/audit_failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-17T00-26-41/agents_scope_map.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/indexing.config.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/synthesis_grpo_wiring.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/authority_pipeline_trace.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/audit_failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-15T21-39-17/agents_scope_map.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T01-05-54/relationship_map.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T01-05-54/graph_edges.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T01-05-54/ace_hit_relationships.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-59/authority_pipeline_trace.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-59/audit_gates.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-13T06-06-59/audit_failures.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07/smoke-001/run.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag_error_506389f1_2026-05-06T22-32-43/vector_hits.json` | 0.000 | `binary_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag_error_506389f1_2026-05-06T22-32-43/ingest.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag_error_506389f1_2026-05-06T22-32-43/ace_hits.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag_error_2e53fd23_2026-05-06T22-34-56/vector_hits.json` | 0.000 | `binary_weights` | ❌ No | `gpu-turbovec` | `gpu_training_input` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag_error_2e53fd23_2026-05-06T22-34-56/ingest.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `memory/runs/`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-06/kag_error_2e53fd23_2026-05-06T22-34-56/ace_hits.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/01cb725b540e/orphan_symbols.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/01cb725b540e/missing_agents_md.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/01cb725b540e/cluster_map.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/knowledge/document-knowledge-manifest.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/knowledge/document-knowledge-edges.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/knowledge/document-knowledge-cards.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/kb/weights/rerank-profile.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/kag-notes/manifest.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-09/smoke-001/run.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-04/relationship_map.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-04/graph_edges.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-04/ace_hit_relationships.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-01/relationship_map.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-01/graph_edges.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T02-21-01/ace_hit_relationships.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/index/lexical-summary.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/index/feature-summary.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/index/docs-summary.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/index/ace-prefix-toon-summary.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-01-36/audit_gates.json` | 0.000 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T15-56-22/audit_gates.json` | 0.000 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/exports/karpathy-qdrant-cluster-backfill.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/exports/engram-transition-memory.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/runs/2026-05-07T14-55-56/audit_gates.json` | 0.000 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/exports/cluster-cards.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/exports/atlas/codebase-ingest.ndjson` | 0.000 | `ndjson_dataset` | ✅ Yes (rule: `*.ndjson`) | `cold` | `ldjson_batch` |
| `sveltekit-frontend/memory/exports/atlas/codebase-ingest-manifest.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/docstore/manifest.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/datasets/legal-contracts/synthetic/contract_002_employment.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/datasets/legal-contracts/synthetic/contract_001_nda.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/cards/summary-card-error-research.jsonl` | 0.000 | `jsonl_dataset` | ✅ Yes (rule: `*.jsonl`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-9-0.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-7-0.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-6-2.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-4-0.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-3-1.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-3-0.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-1-3.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/agents-dag/cluster-0-1.json` | 0.000 | `json_document` | ✅ Yes (rule: `memory/agents-dag/`) | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-08/smoke-001/run.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-11-51/audit_gates.json` | 0.000 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T17-03-59/audit_gates.json` | 0.000 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-46-33/audit_gates.json` | 0.000 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T16-22-48/audit_gates.json` | 0.000 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T21-08-58/synthesis_grpo_wiring.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/synthesis_grpo_wiring.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/authority_pipeline_trace.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T20-53-22/audit_gates.json` | 0.000 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/authority_pipeline_trace.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/audit_gates.json` | 0.000 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T19-11-14/audit_failures.json` | 0.000 | `json_document` | ❌ No | `cold` | `ignore_generated` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/authority_pipeline_trace.json` | 0.000 | `json_document` | ❌ No | `runtime-safe` | `keep_runtime` |
| `sveltekit-frontend/memory/runs/2026-05-07T18-56-43/audit_gates.json` | 0.000 | `json_document` | ❌ No | `cold` | `ignore_generated` |

## Notes & Next Steps
- **Postgres 18 / canonical truth**: Active retrieval query flows should filter against active Postgres rows.
- **No multi-engine hybrid redundancy**: Keep CouchDB, DuckDB, and MapReduce scripts strictly in the offline/derived report pipeline.
- **GPU autoencoder**: Prepare GPU training datasets (`gpu_training_input`) for the upcoming autoencoder loop.
