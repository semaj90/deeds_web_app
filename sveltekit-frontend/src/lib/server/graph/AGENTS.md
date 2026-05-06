# AGENTS.md — `src/lib/server/graph`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/graph

## Snapshot

- server module directory with 20 files, 0 API handlers, 2 Drizzle refs
- Audit score: **95/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `server` `zod` `auth` `db-schema`

## Files (20)

- `src/lib/server/graph/codebase-cluster-detection.ts`
- `src/lib/server/graph/codebase-neo4j-sync.ts`
- `src/lib/server/graph/codebase-scanner-v2.ts`
- `src/lib/server/graph/codebase-scanner.ts`
- `src/lib/server/graph/community-graph.ts`

## Hypergraph cluster

This directory is part of cluster **C73** — function chunks in \`src/lib/server/retrieval\` (tag: vector)

- **Top kinds**: function×14, class×1, type×1
- **Top tags**: `vector` `redis` `embedding` `rag-pipeline` `graph-db`

See `docs/graph/hypergraph-clusters.md` § Cluster 73 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C73 — function chunks in `src/lib/server/retrieval` (tag: vector)
- **BoW texture key**: `texture:bow:cluster:73` (Redis 1h TTL)
- **Qdrant tags**: `vector` `redis` `embedding` `rag-pipeline` `graph-db`
- **Paired tests**: 1/20 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "graph", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server graph", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/graph/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 73 })` — BoW texture tile for cluster C73
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 73 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
