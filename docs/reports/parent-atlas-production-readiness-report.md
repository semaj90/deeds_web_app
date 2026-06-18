# Parent Atlas Production Readiness Audit

Generated: 2026-06-17T15:00:54.295Z

## Summary

- PASS: 65
- WARN: 1
- FAIL: 0

## Key Signals

- Parent Atlas documents: 5395
- Atlas feature map rows: 19611
- NES/CHROM packets: 14911
- Route runtime packets: 1
- Qdrant points: 52606
- Neo4j CodebaseFile nodes: 0
- Redis LOD0 latest packet coverage: 1/1
- Native JSON parser: native addon path present; fallback present
- NDJSON files discovered with rg -uuu: 184
- Phase 101 batch summaries: 35 succeeded / 0 failed
- Autoencoder dims: 768→256→64

## Directory Lanes

- scripts/atlas/: batch summaries validated, NDJSON/DuckDB offline indexing present, and the production readiness audit is read-only
- scripts/atlas/gemma4-parent-atlas-summaries.mjs: latest cached batch report loaded (35 queued)
- scripts/atlas/ndjson-mapreduce-join.mjs: offline MapReduce join, cluster summaries, and graph-edge generation present
- scripts/atlas/materialize-mapreduce-duckdb.mjs: DuckDB materialization lane present
- sveltekit-frontend/src/lib/server/gpu/: libtorch/autoencoder/topology projection lane present; internal torch::mm GEMM is detected; generic matmul_f32 export remains absent
- sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts: native JSON parser path is present with a JSON.parse fallback; optional parser validation scripts exist
- sveltekit-frontend/src/lib/server/db/: Drizzle barrels mirror the NES/CHROM and route runtime packet schemas

## Checks

- PASS [summary-batch] report:exists: Loaded gemma4-parent-atlas-summary-cache-report.json (35 queued)
- PASS [summary-batch] report:passed: Failed rows: 0
- PASS [summary-batch] report:sourceRefReads: sourceRef packet reads: 35
- PASS [summary-batch] report:summariesWritten: summaries written: 35
- PASS [summary-batch] report:cache-counters: Exact hits=0, semantic hits=0, llama calls=35
- PASS [gpu] libtorchBridge: sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts exists
- PASS [gpu] pytorchGraph: sveltekit-frontend/src/lib/server/gpu/pytorch-graph.ts exists
- PASS [gpu] autoencoderBridge: sveltekit-frontend/src/lib/server/gpu/autoencoder-bridge.ts exists
- PASS [gpu] topologyProjection: sveltekit-frontend/src/lib/server/gpu/topology-projection.ts exists
- PASS [gpu] trainAutoencoderPy: sveltekit-frontend/scripts/train-autoencoder.py exists
- PASS [gpu] trainAutoencoderMjs: sveltekit-frontend/scripts/train-autoencoder.mjs exists
- PASS [gpu] somPipeline: scripts/atlas/pytorch-qdrant-redis-som-index.mjs exists
- PASS [gpu] libtorchGraphImpl: simd-bridge/cpp/libtorch_graph_impl.cpp exists
- PASS [gpu] pytorchGraphCpp: simd-bridge/cpp/pytorch_graph.cc exists
- PASS [gpu] pytorchGraphFp16Cpp: simd-bridge/cpp/pytorch_graph_fp16.cc exists
- PASS [gpu] cuvsBridge: simd-bridge/cpp/cuvs_bridge.cc exists
- PASS [gpu] dimensions:768-256-64: Autoencoder dims: 768→256→64
- PASS [gpu] som:grid: SOM grid: 8×8
- PASS [gpu] bridge:torch-mm-backend: Internal GEMM is present: simd-bridge/cpp/libtorch_graph_impl.cpp and simd-bridge/cpp/pytorch_graph_fp16.cc use torch::mm(); LibTorch GPU tensors dispatch torch::mm() through CUDA/cuBLAS where available.
- PASS [gpu] bridge:matmul-export: No generic public matmul_f32 native bridge export is exposed yet; this is a public API gap, not evidence that GEMM is absent. Keep the canonical 768→256→64 autoencoder lane valid.
- PASS [native-json-parser] simdjsonBridge: sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts exists
- PASS [native-json-parser] jsonBench: scripts/bench/json-parse-bench.mjs exists
- PASS [native-json-parser] parserSmoke: sveltekit-frontend/scripts/smoke/qdrant-simdjson-parser-smoke.mjs exists
- PASS [native-json-parser] rustAddonPackager: simd-bridge/scripts/package-win.ps1 exists
- PASS [native-json-parser] overall: Native simdjson parser path is present and the JSON.parse fallback remains in place.
- PASS [drizzle] nesChromSchema: sveltekit-frontend/src/lib/server/db/schema/nes-chrom-packets.ts exists
- PASS [drizzle] routeRuntimeSchema: sveltekit-frontend/src/lib/server/db/schema/route_runtime_packets.ts exists
- PASS [drizzle] schemaIndex: sveltekit-frontend/src/lib/server/db/schema/index.ts exists
- PASS [drizzle] schemaPostgres: sveltekit-frontend/src/lib/server/db/schema-postgres.ts exists
- PASS [drizzle] mirrors:nes-chrom-route-runtime: Drizzle barrels mirror NES/CHROM and route runtime packet schemas
- PASS [offline] .tmp/offline-synthesis/consolidated-index.ndjson: .tmp/offline-synthesis/consolidated-index.ndjson exists
- PASS [offline] .tmp/offline-synthesis/consolidated-index.ndjson.manifest.json: .tmp/offline-synthesis/consolidated-index.ndjson.manifest.json exists
- PASS [offline] docs/reports/offline-synthesis-mapreduce.duckdb: docs/reports/offline-synthesis-mapreduce.duckdb exists
- PASS [offline] docs/reports/offline-synthesis-mapreduce-duckdb-report.json: docs/reports/offline-synthesis-mapreduce-duckdb-report.json exists
- PASS [offline] docs/reports/offline-synthesis-mapreduce-duckdb-report.md: docs/reports/offline-synthesis-mapreduce-duckdb-report.md exists
- PASS [offline] docs/reports/production-qdrant-no-som-report.json: docs/reports/production-qdrant-no-som-report.json exists
- PASS [offline] docs/reports/route-runtime-packets-report.json: docs/reports/route-runtime-packets-report.json exists
- PASS [offline] docs/reports/compressed-semantic-geometry-report.json: docs/reports/compressed-semantic-geometry-report.json exists
- PASS [offline] docs/reports/hidden-packet-pathmap-report.json: docs/reports/hidden-packet-pathmap-report.json exists
- PASS [offline] docs/reports/hidden-packet-pathmap-duckdb-report.json: docs/reports/hidden-packet-pathmap-duckdb-report.json exists
- PASS [offline] docs/reports/hidden-packet-pathmap.duckdb: docs/reports/hidden-packet-pathmap.duckdb exists
- PASS [offline] scripts/atlas/ndjson-mapreduce-join.mjs: scripts/atlas/ndjson-mapreduce-join.mjs exists
- PASS [offline] scripts/atlas/materialize-mapreduce-duckdb.mjs: scripts/atlas/materialize-mapreduce-duckdb.mjs exists
- PASS [offline] scripts/atlas/offline-parent-atlas-mapreduce.sql: scripts/atlas/offline-parent-atlas-mapreduce.sql exists
- PASS [offline] scripts/atlas/gemma4-parent-atlas-summaries.mjs: scripts/atlas/gemma4-parent-atlas-summaries.mjs exists
- PASS [offline] scripts/atlas/report-compressed-semantic-geometry.mjs: scripts/atlas/report-compressed-semantic-geometry.mjs exists
- PASS [offline] scripts/atlas/audit-hidden-packet-pathmap.mjs: scripts/atlas/audit-hidden-packet-pathmap.mjs exists
- PASS [offline] scripts/atlas/materialize-hidden-packet-pathmap-duckdb.mjs: scripts/atlas/materialize-hidden-packet-pathmap-duckdb.mjs exists
- PASS [offline] rg-uu:ndjson-inventory: rg -uuu found 184 NDJSON files
- PASS [postgres] table:parent_atlas_documents: parent_atlas_documents exists with 5395 rows
- PASS [postgres] table:atlas_feature_map: atlas_feature_map exists with 19611 rows
- PASS [postgres] table:atlas_feature_map_synthesized: atlas_feature_map_synthesized exists with 14465 rows
- PASS [postgres] table:nes_chrom_packets: nes_chrom_packets exists with 14911 rows
- PASS [postgres] table:nes_chrom_kag_dag_hits: nes_chrom_kag_dag_hits exists with 32 rows
- PASS [postgres] table:route_runtime_packets: route_runtime_packets exists with 1 rows
- PASS [postgres] table:task_semantic_packets: task_semantic_packets exists with 314 rows
- PASS [postgres] table:codebase_chunk_index: codebase_chunk_index exists with 40754 rows
- PASS [postgres] table:agent_pickup_queue: agent_pickup_queue exists with 135 rows
- PASS [postgres] parent_atlas_documents:sourceRef: Parent Atlas sourceRefs: 3941/3941
- PASS [postgres] parent_atlas_documents:summaries: Parent Atlas summaries: 3794/3941
- PASS [postgres] active-production:topology: Active production qdrant-without-SOM rows: 0
- PASS [postgres] nes-chrom:sourceRef-parent-join: NES/CHROM packets matching Parent Atlas: 10042/14911
- PASS [postgres] route-runtime:sourceRefs: Runtime packets with sourceRefs: 1/1
- PASS [redis] lod0:route-runtime: Redis LOD0 runtime packets: 1/1
- PASS [qdrant] collection:codebase_chunks_768: Qdrant codebase_chunks_768 points: 52606
- WARN [neo4j] contextual-tree: Neo4j CodebaseFile=0, ParentAtlasFeature=0

## Audit Guardrails

- This audit is read-only. It does not run migrations, push Drizzle schema, prune Qdrant, archive files, or mutate production data.
- Qdrant remains the semantic lookup/filter engine; topology math remains external and is audited through payload/table signals.
- Louvain/PageRank are graph algorithms, not PCA/matmul lanes. This report only checks whether Neo4j graph truth is present.
- Cold-storage readiness is treated as provenance visibility here. Actual archive/move flows remain gated.
- Internal GEMM exists in simd-bridge/cpp/libtorch_graph_impl.cpp and simd-bridge/cpp/pytorch_graph_fp16.cc via torch::mm(); LibTorch GPU tensors dispatch torch::mm() through CUDA/cuBLAS where available.
- The remaining native bridge gap is no generic public matmul_f32 export. That is a public API warning, not a failure of the canonical 768→256→64 autoencoder lane.
