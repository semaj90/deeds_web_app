# SourceRef Atlas Join Inventory

**Generated:** 2026-06-01T08:25:00.000Z

## Join Spine

- `file_path`
- mapreduce `stableKey`
- `sourceRef`
- `parent_atlas_card_id`
- `alias_id`
- `feature_id`

## Existing Artifacts

### Mapreduce and path map

- `.tmp/mapreduce-full-v4.ndjson`
- `.tmp/mapreduce-full-v4.ndjson.manifest.json`
- `.tmp/path-map.json`
- `.tmp/path-map.ndjson`
- `scripts/atlas/mapreduce-consolidated-index.mjs`
- `scripts/atlas/missing-features-review.mjs`
- `docs/graph/missing-features-path-map.json`
- `docs/graph/missing-features-path-map.md`

### DuckDB and parent atlas

- `.tmp/ingest/atlas.duckdb`
- `.tmp/ingest/parent_atlas.parquet`
- `.tmp/ingest/parent_atlas_full.parquet`
- `.tmp/ingest/parent_atlas_gpu.ndjson`
- `.tmp/ingest/parent_atlas_gpu.parquet`
- `.tmp/parent-atlas-index.json`
- `.tmp/parent-atlas-validation.json`
- `memory/exports/parent-atlas/parent_atlas_index.json`
- `docs/atlas/parent-atlas-data-spine.md`
- `docs/architecture/offline-synthesis-parent-atlas.md`

### Qdrant and cache

- `scripts/atlas/qdrant-path-bridge.mjs`
- `docs/reports/qdrant-path-bridge-latest.json`
- `docs/reports/qdrant-path-bridge-latest.md`
- `.tmp/qdrant-postgres-mirror-reconciliation.json`
- `.tmp/qdrant-postgres-mirror-reconciliation.md`
- `sveltekit-frontend/src/lib/server/search/qdrant-search.ts`
- `sveltekit-frontend/src/lib/server/cache/redis-semantic-cache.ts`
- `sveltekit-frontend/src/lib/server/features/rag/codebase-context.ts`

### Neo4j and topology

- `sveltekit-frontend/src/lib/server/graph/neo4j-gds.ts`
- `sveltekit-frontend/src/lib/server/graph/som-topology-pipeline.ts`
- `sveltekit-frontend/src/lib/server/graph/community-graph.ts`
- `sveltekit-frontend/src/lib/server/features/rag/codebase-context.ts`
- `docs/atlas/phase-20-training-readiness.md`

### PostgreSQL 18 path tables (live, port 5434)

- `path_map` — 3,270 rows: stableKey → file_path + feature + import_error_count + directory (GIN-indexed)
- `feature_todo_queue` — 131 rows: pending queue mirroring RabbitMQ `atlas.feature.todo` (status/priority/enqueued_at indexed)
- RabbitMQ `atlas.feature.todo` — 131 messages live (16 high / 15 medium / 100 low priority)

### Retrieval and recommendation

- `scripts/ingest/retrieval-pass.mjs`
- `scripts/ingest/rank-cards.mjs`
- `scripts/ingest/compress-cards.mjs`
- `scripts/ingest/rerank-cards.mjs`
- `scripts/opencode/build-recommendations.mjs`
- `docs/reports/retrieval-pass-dry-run.md`
- `.tmp/retrieval-pass-dry-run.json`
- `.tmp/retrieval-pass-dry-run.ndjson`

### Schema and alias

- `sveltekit-frontend/src/lib/server/db/schema/tasks.ts`
- `sveltekit-frontend/src/lib/server/db/schema/atlas-profile-store.ts`
- `sveltekit-frontend/src/lib/server/db/schema/index.ts`
- `sveltekit-frontend/drizzle/manual/20260601_task_semantic_packets_alias_id_and_atlas_profile_gin.sql`
- `.tmp/alias-id-migration-preflight-report.json`
- `.tmp/alias-id-migration-preflight-report.md`
- `docs/reports/alias-id-readiness.json`
- `docs/reports/alias-id-readiness.md`

### Provenance and join aids

- `docs/graph/missing-features-review-latest.json`
- `docs/graph/missing-features-review-latest.md`
- `docs/graph/missing-features-review-latest.svg`
- `.tmp/atlas-token-map.jsonl`
- `.tmp/atlas-token-map.md`
- `.tmp/atlas-retrieval-loop.jsonl`
- `.tmp/atlas-parent-join-readiness.json`
- `.tmp/atlas-parent-join-readiness.md`
- `docs/graph/kanban-board.json`
- `docs/graph/kanban-parent-atlas-alignment.md`

## Notes

- Qdrant point ids are not the atlas join key.
- Use `file_path` / mapreduce `stableKey` / `sourceRef` to bridge into parent-atlas card identity.
- `alias_id` is present in schema and read-only preflight, but should only be written through bounded promotion paths that preserve provenance.
- PG18 remains a target shape; the repo currently has Postgres 18-friendly SQL sidecars and schema definitions, not a forced live upgrade.

## Completed (2026-06-01)

- `path_map` PG18 table created and loaded (3,270 rows, 4 indexes)
- `feature_todo_queue` PG18 table created and loaded (131 rows, 4 indexes)
- RabbitMQ `atlas.feature.todo` queue populated (131 messages)
- `scripts/ingest/retrieval-pass.mjs` rewritten with real Ollama embeddings, Qdrant ANN, Neo4j expansion, Redis packet cache, Langfuse trace
- `scripts/atlas/mapreduce-path-join.mjs` wired end-to-end (DuckDB join + RabbitMQ publish + PG18 mirror)
- `alias_id` column confirmed present in `task_semantic_packets`

## Next Safe Action

Review the sourceRef-parent-join dry-run report, then use the packet manifests to keep cold originals archived and warm indexes compact without mutating Qdrant, Neo4j, Redis, or Postgres.
