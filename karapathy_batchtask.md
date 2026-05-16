# Karpathy Batch Context Synthesis

## Role
The Karpathy batch lane is the repo-level synthesis stage for codebase intelligence.

It reads:
- `docs/graph/codebase-graph.json`
- SvelteKit route maps
- Redis wiki notes and PageRank scores
- Qdrant cluster payloads
- Gemma4 summaries and EmbeddingGemma embeddings

It writes:
- `glyph_atlas`
- `Redis` hot caches like `agents:dir:*`, `code:llm_output:path:*`, `summary:cluster:*`
- batch reports in `docs/graph/`

## Pipeline Order
1. Repo-root atlas discovery
2. Workspace and language maps
3. Route and import maps
4. Env and sidecar maps
5. Qdrant payload tagging
6. Neo4j GraphRAG projection
7. CouchDB wiki / MapReduce rollups
8. Karpathy batch synthesis
9. Redis ACE / BitFrost hot cache
10. AGENTS regeneration
11. Validation reports

## Rules
- GPU is optional, not required for correctness.
- Dry-run first.
- Fail open for cache and report stages.
- Keep SvelteKit graph files as inputs, not outputs.
- Do not store raw tensors, KV cache, or hidden reasoning in Redis or Neo4j.

## Preferred Command Surface
- `npm run atlas:root:full`
- `npm run graphify:karpathy-batch`
- `npm run atlas:qdrant:tag`
- `npm run atlas:neo4j:ingest`
- `npm run atlas:couchdb:mapreduce`
- `npm run atlas:redis:sync`
- `npm run atlas:validate`

## Store TODO
- Qdrant: tag semantic payloads, cluster aliases, and glyph atlas points.
- Neo4j: project file, route, feature, cluster, and datastore edges.
- CouchDB: roll up directory wiki docs, cluster summaries, and feature cards.
- Redis: cache hot ACE cards, directory notes, cluster summaries, and llm outputs.
- AGENTS: regenerate workspace summaries without overwriting human-edited files.
- Engram: add optional adapter-only episodic memory writes and search.
- Postgres: keep durable audit and hit records if writeback is enabled.
- Gemma4: synthesize directory and cluster summaries.
- EmbeddingGemma: generate semantic vectors for glyph and payload indexing.
- LibTorch / CUDA: use only as optional acceleration, never as a correctness dependency.
