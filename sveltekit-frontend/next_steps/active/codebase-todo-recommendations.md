# Codebase Index Loop TODO

## Goal
Finish the canonical graphRAG indexing loop once, then reuse it everywhere: graph ingest, Redis centroids, SOM autoencoding, LLMS.md atlas refresh, Karpathy GPU ranking, and golden retrieval packet replay.

## Current Artifacts
- Graph: `docs/graph/codebase-graph.json` (32,044 files, 1,401 dirs, 0 clusters)
- Atlas: `docs/atlas-index/codebase-atlas.min.json` (7,843 files indexed)
- LLMS atlas: `memory/atlas/codebase-atlas.latest.md` (14,423 bytes)

## Codebase Mapper Contract
- Skill contract: `scripts/skills/codebase_mapper.skill.json`
- Scope: routes, services, schemas, docs, memory surfaces, and scripts
- Outputs: feature-flow maps, doc-feature alignment, gap clusters, recommendations
- Use this as the single mapping contract for `.md` / `.txt` coverage scans and gap reports
- Karpathy publish split is now wired through `npm run karpathy:publish-split`, which materializes `ace:cluster:hot`, `ace:cluster:tags:__meta`, and the `memory/exports/karpathy-publish-split.*` artifacts from `docs/graph/hypergraph-clusters.json`.
- Cluster payload backfill is wired through `npm run karpathy:qdrant-backfill`, which patches matching Qdrant points with cluster narrative / hotness metadata and emits `memory/exports/karpathy-qdrant-cluster-backfill.*`.
- `npm run karpathy:gpu:insights` now runs publish split, Qdrant backfill, and the repo-root XGBoost hotness scorer in one chain.
- `HypergraphRoutingService` now pulls `ace:cluster:hot` directly and exposes the hot cluster ids in routing explanations.
- Postgres hybrid retrieval is now wired through `search:sync:pg`, `search_code_hybrid_pg`, `search:fts:smoke`, and `search:hybrid:smoke`.

## Canonical Loop
1. `npm run graphify:daily` refreshes the graph ingestion surface.
2. `npm run atlas:build` rebuilds the LLM atlas from the fresh graph.
3. `npm run graphify:som` updates SOM/topology projections.
4. `npm run ae:train:js` retrains the autoencoder loop.
5. `npm run ae:centroids` refreshes Redis centroids.
6. `npm run ae:backfill` pushes the new embeddings back into Qdrant.
7. `npm run llms:write && npm run llms:index` refreshes the LLMS.md atlas.
8. `npm run karpathy:gpu:insights` rebuilds Karpathy scores on top of the atlas.
9. `npm run smoke:golden-retrieval` verifies the packet writer/reader/updater path; the remaining soft yellow is `feature_ids` coverage on older Qdrant payloads.

## No Duplicate Paths
`graphify:daily` is the shared ingest entrypoint.
`karpathy:gpu:insights` now rebuilds Atlas first and materializes the hot-cluster publish split, Qdrant cluster payload backfill, and XGBoost hotness scoring in one lane.
`HypergraphRoutingService` now merges the hot set into the routed cluster ids so retrieval sees the same hot-cluster lane as ACE warmup.
`search:sync:pg` now mirrors Qdrant content vectors into `code_retrieval_chunks` and the Postgres hybrid smoke checks the FTS/vector lane.
`create:todo` is the single TODO generator; `skill:codebase-todo:*` aliases to it.
Golden retrieval is the read-only replay gate for packet writer/reader/updater coverage. Keep the `feature_ids` backfill lane visible until older Qdrant payloads carry that field.

## Next Step
Run the canonical loop, then regenerate this TODO so the task list stays aligned with the latest atlas.

## Mapping Follow-up
After the canonical loop is current, run a codebase mapping pass against the active skill contract and record:
- feature ownership
- doc drift
- missing persistence
- indexing/storage gaps
- leak and optimization candidates

## Engram Sidecar Gap Map
- Durable address registry is still missing as a single contract. Track the explicit ownership fields (`memory_id`, `source_id`, `chunk_id`, `summary_id`, `cluster_id`, `packet_id`, `embedding_id`) in one registry before widening the sidecar.
- Semantic cache policy is still fragmented across Redis exact-match, semantic cache, Bifrost, Qdrant, and ACE packet caches. Keep the exact-cache key contract, semantic-cache compatibility contract, packet-version contract, and invalidation rule visible in the backlog.
- Deque semantics should stay bounded to recent-session memory only; queue semantics should remain for ingestion/backfill/embedding/rebuild jobs. Do not blur those roles in the next registry pass.
- The existing `engram-memory.ts` and `local-engram-memory-adapter.ts` are the current seed, not the durable registry boundary.

## Audit Checkpoint
- Chunk 2 dependency smoke is passing for `smoke:fast-ast` and `graphify:deep:smoke`.
- `index:karpathy` is currently blocked because `sg/ast-grep` is missing on PATH.
- Chunk 3 storage integrity work is active:
  - Redis key hygiene
  - Qdrant cosine payload/dimension checks
  - pgvector JSONB + cosine operator path
  - Neo4j recovery/auth path
  - Bifrost-only synthesis boundary
- Docker runtime is present on this machine (`docker.exe` found on PATH) and `dockerode@4.0.9` is installed in the app repo.
- OpenCode config already advertises 64K TurboQuant context and remote MCP endpoints for TRACE / TurboVec / Engram / LangExtract.
- Added a read-only inference-log smoke task: `npm run smoke:inference-log` and a VS Code task `🧾 Observability: Inference Log Smoke`.
- `npm run audit:inference-observability` passes against live native CouchDB `http://127.0.0.1:5984/` and RabbitMQ `http://127.0.0.1:15672/api/overview`; Docker containers are not required for the audit to pass.
- Golden retrieval is green at 7/7; the only soft yellow left is `feature_ids` in older Qdrant payloads, which stays on the `atlas:qdrant:feature-ids:derive` lane.
- `npm run atlas:qdrant:source-refs:backfill:dry` is read-only and reports 3,253 attempted / 0 updated / 3,253 skipped, so the remaining work is payload backfill coverage rather than a missing replay gate.
- The feature-id derivation lane is effectively closed after the bounded patch check; the remaining payload gap is now `somRow/somCol` coverage on older points. Keep SOM materialization separate from golden retrieval replay claims.

## Feature Map Update
- Added `gpu-compute-plane` to `src/lib/server/atlas/master-feature-map.ts`.
- Ground truth doc: `docs/features/feature_gpu_compute_plane.md`.
- Include this feature in doc-to-feature scans and feature-gap reports.
- Regression guard added: `src/lib/server/atlas/master-feature-map.test.ts` validates the entry and schema shape.
- Downstream export now emits `memory/exports/feature-map-cards.jsonl` and includes `feature-map:gpu-compute-plane` in the selected card bundle.
- `npm run cards:pipeline` is passing with the feature-map export wired through Redis and TOON.
- Canonical feature labels now flow through `src/lib/server/labels/feature-label-registry.ts` and are shared by retrieval subgraphs, label sinks, and the feature-card pipeline.

## Summary Card Update
- `scripts/normalize-codebase-summary-cards.mjs` now generates deterministic file, symbol, route, table, tool, error, and test summary cards.
- The lane writes `memory/cards/codebase-summary-cards.jsonl`, `memory/cards/top-100-codebase-summary-cards.json`, `memory/cards/top-100-codebase-summary-cards.toon`, and `docs/reports/top-100-codebase-summary-cards.md`.
- Storage is wired through Postgres `summary_cards`, Qdrant `summary_cards_768`, and Redis hot-card keys.
- `LLMS.md` gets an append-only dated section instead of destructive replacement.
- Operational probes now exist for `duckdb:cards:inspect`, `prompt:cache:verify`, and `redis:cards:keys`.
