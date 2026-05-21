# Codebase Index Loop TODO

## Goal
Finish the canonical graphRAG indexing loop once, then reuse it everywhere: graph ingest, Redis centroids, SOM autoencoding, LLMS.md atlas refresh, and Karpathy GPU ranking.

## Current Artifacts
- Graph: `docs/graph/codebase-graph.json` (32,044 files, 1,401 dirs, 0 clusters)
- Atlas: `docs/atlas-index/codebase-atlas.min.json` (7,843 files indexed)
- LLMS atlas: `memory/atlas/codebase-atlas.latest.md` (14,423 bytes)

## Codebase Mapper Contract
- Skill contract: `scripts/skills/codebase_mapper.skill.json`
- Scope: routes, services, schemas, docs, memory surfaces, and scripts
- Outputs: feature-flow maps, doc-feature alignment, gap clusters, recommendations
- Use this as the single mapping contract for `.md` / `.txt` coverage scans and gap reports

## Canonical Loop
1. `npm run graphify:daily` refreshes the graph ingestion surface.
2. `npm run atlas:build` rebuilds the LLM atlas from the fresh graph.
3. `npm run graphify:som` updates SOM/topology projections.
4. `npm run ae:train:js` retrains the autoencoder loop.
5. `npm run ae:centroids` refreshes Redis centroids.
6. `npm run ae:backfill` pushes the new embeddings back into Qdrant.
7. `npm run llms:write && npm run llms:index` refreshes the LLMS.md atlas.
8. `npm run karpathy:gpu:insights` rebuilds Karpathy scores on top of the atlas.

## No Duplicate Paths
`graphify:daily` is the shared ingest entrypoint.
`karpathy:gpu:insights` now rebuilds Atlas first.
`create:todo` is the single TODO generator; `skill:codebase-todo:*` aliases to it.

## Next Step
Run the canonical loop, then regenerate this TODO so the task list stays aligned with the latest atlas.

## Mapping Follow-up
After the canonical loop is current, run a codebase mapping pass against the active skill contract and record:
- feature ownership
- doc drift
- missing persistence
- indexing/storage gaps
- leak and optimization candidates

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

## Feature Map Update
- Added `gpu-compute-plane` to `src/lib/server/atlas/master-feature-map.ts`.
- Ground truth doc: `docs/features/feature_gpu_compute_plane.md`.
- Include this feature in doc-to-feature scans and feature-gap reports.
- Regression guard added: `src/lib/server/atlas/master-feature-map.test.ts` validates the entry and schema shape.
- Downstream export now emits `memory/exports/feature-map-cards.jsonl` and includes `feature-map:gpu-compute-plane` in the selected card bundle.
- `npm run cards:pipeline` is passing with the feature-map export wired through Redis and TOON.
