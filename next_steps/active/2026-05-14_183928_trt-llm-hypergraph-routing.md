# TRT-LLM + Hypergraph Routing Prompt

Use this for the next implementation pass.

## Goal
Improve long-context performance by routing retrieval through hypergraph clusters first, and keep TRT-LLM as a separate later experiment rather than a hard dependency.

## Core idea
- Compression helps, but it does not remove KV cache, workspace, or runtime overhead.
- Smaller Gemma4 models need better retrieval, summaries, graph paths, and cluster routing.
- The app should not rely on giant raw contexts.

## Architecture reminder
- NVMe / SeaweedFS: raw documents and artifacts.
- Postgres: durable metadata and topology rows.
- Qdrant: semantic vectors and payload filters.
- Neo4j: graph paths and evidence links.
- Redis: hot centroid cache and ACE cluster cards.
- Gemma4: final reasoning only after retrieval narrows context.

## Immediate work
1. Add query-time HyperRAG topology routing.
2. Call the hypergraph lookup path from `HyperRagFusionService`.
3. Filter Qdrant by `gpu_cluster` or `som_cluster`.
4. Add Redis cluster cards at `ace:cluster:{clusterId}`.
5. Sync cluster digests into docs and AGENTS/Karpathy indexing.
6. Add Qdrant payload validation for cluster fields.
7. Add a topology lookup benchmark.
8. Add a smoke test for clustered retrieval.

## Routing rule
- Default: `useTopologyRouting = true`, `topologyTopK = 3`, `clusterField = gpu_cluster`.
- Fail open: if the lookup service is down, fall back to normal Qdrant search.

## What TRT-LLM is for
- Future inference optimization only.
- Compare VRAM, throughput, and quality later.
- Do not replace TurboQuant or make TRT-LLM required for dev.

## Do not do yet
- Do not move to TRT-LLM as the primary path.
- Do not store raw KV cache in Redis.
- Do not expose raw vectors to browser clients.
- Do not overfit the system to long context.

## Suggested next tests
- `npm run smoke:mcp:trace`
- cluster routing smoke
- Qdrant payload validation smoke
- topology lookup benchmark

## Best next commit shape
- `feat(hyperrag): route Qdrant search through hypergraph clusters`
- `test(hyperrag): validate topology-routed retrieval fallback`
- `docs(gpu): record TRT-LLM as future spike only`
