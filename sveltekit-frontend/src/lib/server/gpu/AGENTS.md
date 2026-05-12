# AGENTS.md — `src/lib/server/gpu`

## Audit Gates — GPU / N-API / LibTorch

> Auto-mapped from CLAUDE.md §"Unified Audit Gate System". Last enriched: 2026-05-11
> Run each check from the **sveltekit-frontend/** root.

### Tier A — Code Connectivity

**G8b** GPU/Analysis layer — NO @sveltejs/kit imports (pure fns only)
```bash
rg "from .@sveltejs/kit.|from .\$app/" src/lib/server/gpu/ src/lib/server/analysis/ src/lib/server/vector/ --no-heading  # 0 hits
```

### Tier C — Infrastructure

**G14** Native .node addon via createRequire
```bash
rg "\.node['")] |createRequire" src/ --type ts -l
```

**G17** No hardcoded localhost — use ENV.* getters
```bash
rg "localhost|127\.0\.0\.1" src/lib/server/ --type ts  # expect 0 outside env.server.ts
```

### Tier F — Contextual Graph (pytorch-graph)

**G27** kmeansWithCentroids AND trainSOM imported
```bash
rg "kmeansWithCentroids|trainSOM" src/lib/server/ --type ts -l  # ≥2 files
```

**G31** som_cluster payload written to Qdrant after SOM
```bash
rg "som_cluster" src/lib/server/ --type ts
```

**G32** SIMILAR_TOPOLOGY Neo4j relationship created
```bash
rg "SIMILAR_TOPOLOGY" src/lib/server/ --type ts
```

**G33** pageRankGPU wired in graph module
```bash
rg "pageRankGPU" src/lib/server/graph/ --type ts
```

**G34** attentionScoreGPU wired for ACE context weighting
```bash
rg "attentionScoreGPU" src/lib/server/ --type ts -l
```

**G35** rewardScoreGPU available for GRPO pipeline
```bash
rg "rewardScoreGPU" src/lib/server/ --type ts -l
```


## TODO — Enhancements from ACE Analysis

> Generated from Redis ACE hits (code:graph:node:* + hotspot data). Regenerate: `node scripts/enrich-agents-md.mjs`.

- [ ] **test-coverage** `src/lib/server/gpu/autoencoder-weights.ts` fanIn=10 — add G26-pattern test (10 consumers depend on this)
- [ ] **G17** Audit for remaining hardcoded `localhost` / `127.0.0.1` — replace with `ENV.*` getters
- [ ] **G8b** Confirm no `@sveltejs/kit` imports exist in this directory (GPU layer must be framework-agnostic)
- [ ] **G27** Verify addon exports: `node -e "const a=require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); ['kmeansWithCentroids','trainSOM','pageRankGPU','attentionScoreGPU','rewardScoreGPU'].forEach(f=>console.log(f,typeof a[f]))"` — all must be 'function'

## Fix Timeline

> Recent commits touching this directory — newest first. Used by agents to correlate errors with fixes.

| Commit | Timestamp | Subject |
|--------|-----------|---------|
| `06fcc5de8d` | 2026-05-11T10:23 | feat(autoencoder): D1-D4 wire-in — weights loader, 768→64 encode chain, backfill, centroids, Stage A0 prefilter |
| `618dee240c` | 2026-05-11T01:39 | 59_26_agents_master_hermes_quest |
| `2dccb6c40c` | 2026-05-10T19:57 | fix(audit-p1): clear remaining 15 tsgo errors (15 → 0) |
| `61c9fe9bc6` | 2026-05-10T05:21 | 510_26 |
| `d98e5f8864` | 2026-05-09T19:52 | chore(graphify): second regeneration pass — obsidian indexes, memory atlas, AGENTS.md hierarchy |
| `520503c2d5` | 2026-05-09T01:17 | 58_ |

<!-- /AGENTS-ENRICH -->



<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-12T03:12:15.164Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/gpu

## Snapshot

- server module directory with 17 files, 0 API handlers, 2 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `test` `db-schema` `zod`

## Files (17)

- `src/lib/server/gpu/autoencoder-bridge.ts`
- `src/lib/server/gpu/autoencoder-scripts.test.ts`
- `src/lib/server/gpu/autoencoder-session.ts`
- `src/lib/server/gpu/autoencoder-weights.ts`
- `src/lib/server/gpu/autoencoder.test.ts`

## Hypergraph cluster

This directory is part of cluster **C20** — function chunks in \`src/lib/webgpu\` (tag: embedding)

- **Top kinds**: function×9, class×5, const×1
- **Top tags**: `embedding` `redis` `vector` `auth` `schema`

See `docs/graph/hypergraph-clusters.md` § Cluster 20 for full digest.

## Tools

> MCP tools the Gemma4 agent should reach for inside this directory.
- kag.multi_lane_search
- graph.expand_neighborhood
- topology.same_som_cluster
- clusters.get_members
- context.build_kv_packet
- taxonomy.children

## Qdrant Tags

- embedding
- redis
- vector
- auth
- schema

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C20 — function chunks in `src/lib/webgpu` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:20` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `redis` `vector` `auth` `schema`
- **Paired tests**: 1/17 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "gpu", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server gpu", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/gpu/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 20 })` — BoW texture tile for cluster C20
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 20 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
