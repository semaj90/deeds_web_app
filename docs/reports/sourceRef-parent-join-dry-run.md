# SourceRef Parent Join Dry Run

Generated: 2026-06-02T13:45:43.136Z
Mode: dry-run

## Inputs
- path-map: .tmp/path-map.json
- sourceRef-cardId-map: memory/exports/sourceRef-cardId-map.json
- parent atlas: memory/exports/parent-atlas/parent_atlas_index.json
- inventory: docs/reports/sourceRef-atlas-join-inventory.json
- crosswalk: docs/reports/doc-feature-crosswalk-2026-06-01.json

## Scanner
- rg command: rg -uu -l across docs/memory/scripts/obsidian-vault for sourceRef/pathmap traversal families
- rg groups: 6
- SourceRef / pathmap spine: 380 files
- Parent atlas / packet flow: 1756 files
- Neo4j contextual trees / multi-hop traversal: 2626 files
- Qdrant semantic analysis / clustering: 2169 files
- Redis / Bitfrost cache lane: 3992 files
- Offline processing / mapreduce / DuckDB: 316 files

## Summary
- path rows: 3270
- sourceRef map rows: 1380
- parent atlas rows with sourceRef: 1380
- matched sourceRef map rows: 1380
- unmatched sourceRef map rows: 0
- unmatched parent atlas rows: 0
- packet manifests: 136
- packet validation errors: 0

## Top SourceRef Prefix Clusters
- docs/documents-atlas-index.md | refs=1318 atlas=1318 map=1318
- docs/codebase_directory_map.md | refs=35 atlas=35 map=35
- docs/codebase_indexing_pipeline.md | refs=5 atlas=5 map=5
- docs/error-analysis-architecture.md | refs=4 atlas=4 map=4
- docs/visualization-stack.md | refs=3 atlas=3 map=3
- docs/architecture_guide_v1.md | refs=2 atlas=2 map=2
- docs/compiler-landscape.md | refs=2 atlas=2 map=2
- docs/karpathy_pipeline_architecture.md | refs=2 atlas=2 map=2
- docs/universal_app_readiness_checklist.md | refs=2 atlas=2 map=2
- docs/architecture_guide_v2_enhanced_bits_integration.md | refs=1 atlas=1 map=1
- docs/atlas-vendor-wheels.md | refs=1 atlas=1 map=1
- docs/ci_vendor_wheels.md | refs=1 atlas=1 map=1

## Top Path Packets
- database @ drizzle/manual | files=86 errors=0 resolved=0
- unclassified @ src/lib/server/ai | files=78 errors=1 resolved=196
- database @ src/lib/server/db/schema | files=71 errors=0 resolved=180
- rag @ src/lib/server/retrieval | files=65 errors=0 resolved=164
- unclassified @ src/lib/server/ace | files=52 errors=0 resolved=106
- database @ drizzle | files=48 errors=0 resolved=8
- unclassified @ src/lib/types | files=45 errors=1 resolved=17
- database @ drizzle/archived | files=43 errors=0 resolved=0
- unclassified @ src/lib/utils | files=38 errors=7 resolved=19
- unclassified @ src/lib/server | files=36 errors=0 resolved=50
- unclassified @ src/lib/server/db | files=30 errors=1 resolved=87
- graph @ src/lib/server/graph | files=27 errors=0 resolved=73

## Unmatched Rows
- sourceRef map sample: none
- parent atlas sample: none
- path row sample: src/lib/components/ui/index.ts, src/lib/components/ui/gaming/n64/index.ts, src/lib/components/ui/gaming/index.ts, src/lib/components/ui/alert-dialog/index.js, src/lib/icons/yorha/index.ts

## Doc Scan Families
- SourceRef / pathmap spine: 380 docs
- Parent atlas / packet flow: 1756 docs
- Neo4j contextual trees / multi-hop traversal: 2626 docs
- Qdrant semantic analysis / clustering: 2169 docs
- Redis / Bitfrost cache lane: 3992 docs
- Offline processing / mapreduce / DuckDB: 316 docs

## Next Safe Action
- Review the packet manifests, then move only the stale generated evidence that is already summarized.
- Keep source files, schema files, and live completion notes active.
- Treat SeaweedFS, Postgres, Qdrant, Neo4j, and Redis as warm/cold targets, not the source of truth.
