# Parent Atlas Production Readiness Audit

Generated: 2026-06-05T03:09:00.642Z

## Summary

- PASS: 30
- WARN: 0
- FAIL: 0

## Key Signals

- Parent Atlas documents: 5253
- Atlas feature map rows: 14465
- NES/CHROM packets: 27
- Route runtime packets: 30
- Qdrant points: 76261
- Neo4j CodebaseFile nodes: 25269
- Redis LOD0 latest packet coverage: 25/30
- NDJSON files discovered with rg -uuu: 127

## Checks

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
- PASS [offline] rg-uu:ndjson-inventory: rg -uuu found 127 NDJSON files
- PASS [postgres] table:parent_atlas_documents: parent_atlas_documents exists with 5253 rows
- PASS [postgres] table:atlas_feature_map: atlas_feature_map exists with 14465 rows
- PASS [postgres] table:atlas_feature_map_synthesized: atlas_feature_map_synthesized exists with 14465 rows
- PASS [postgres] table:nes_chrom_packets: nes_chrom_packets exists with 27 rows
- PASS [postgres] table:nes_chrom_kag_dag_hits: nes_chrom_kag_dag_hits exists with 32 rows
- PASS [postgres] table:route_runtime_packets: route_runtime_packets exists with 30 rows
- PASS [postgres] table:task_semantic_packets: task_semantic_packets exists with 302 rows
- PASS [postgres] table:codebase_chunk_index: codebase_chunk_index exists with 40754 rows
- PASS [postgres] table:agent_pickup_queue: agent_pickup_queue exists with 123 rows
- PASS [postgres] parent_atlas_documents:sourceRef: Parent Atlas sourceRefs: 3799/3799
- PASS [postgres] parent_atlas_documents:summaries: Parent Atlas summaries: 3799/3799
- PASS [postgres] active-production:topology: Active production qdrant-without-SOM rows: 0
- PASS [postgres] nes-chrom:sourceRef-parent-join: NES/CHROM packets matching Parent Atlas: 22/27
- PASS [postgres] route-runtime:sourceRefs: Runtime packets with sourceRefs: 27/30
- PASS [redis] lod0:route-runtime: Redis LOD0 runtime packets: 25/30
- PASS [qdrant] collection:codebase_chunks_768: Qdrant codebase_chunks_768 points: 76261
- PASS [neo4j] contextual-tree: Neo4j CodebaseFile=25269, ParentAtlasFeature=1701

## Notes

- This audit is read-only. It does not run migrations, push Drizzle schema, prune Qdrant, archive files, or mutate production data.
- Qdrant remains the semantic lookup/filter engine; topology math remains external and is audited through payload/table signals.
- Louvain/PageRank are graph algorithms, not PCA/matmul lanes. This report only checks whether Neo4j graph truth is present.
- Cold-storage readiness is treated as provenance visibility here. Actual archive/move flows remain gated.
