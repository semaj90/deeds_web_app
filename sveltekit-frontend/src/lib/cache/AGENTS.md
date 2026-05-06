# AGENTS.md — `src/lib/cache`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/cache

## Snapshot

- shared library directory with 5 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `cache` `zod`

## Files (5)

- `src/lib/cache/cache-invalidation.ts`
- `src/lib/cache/cache-service.svelte.ts`
- `src/lib/cache/indexdb-cache.svelte.ts`
- `src/lib/cache/loki-cache.svelte.ts`
- `src/lib/cache/offline-fetch.ts`

## Hypergraph cluster

This directory is part of cluster **C94** — function chunks in \`src/lib/server/cache\` (tag: redis)

- **Top kinds**: function×14, route-handler×1, const×1
- **Top tags**: `redis` `cache` `api` `server` `embedding`

See `docs/graph/hypergraph-clusters.md` § Cluster 94 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C94 — function chunks in `src/lib/server/cache` (tag: redis)
- **BoW texture key**: `texture:bow:cluster:94` (Redis 1h TTL)
- **Qdrant tags**: `redis` `cache` `api` `server` `embedding`
- **Paired tests**: 0/5 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "cache", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib cache", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/cache/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 94 })` — BoW texture tile for cluster C94
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 94 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
