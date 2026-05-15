# Codebase Index Loop TODO

## Goal
Finish the canonical graphRAG indexing loop once, then reuse it everywhere: graph ingest, Redis centroids, SOM autoencoding, LLMS.md atlas refresh, and Karpathy GPU ranking.

## Current Artifacts
- Graph: `docs/graph/codebase-graph.json` (32,044 files, 1,401 dirs, 0 clusters)
- Atlas: `docs/atlas-index/codebase-atlas.min.json` (7,843 files indexed)
- LLMS atlas: `memory/atlas/codebase-atlas.latest.md` (14,423 bytes)

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
