# AGENTS.md — `src/lib/server/observability`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/observability

## Snapshot

- server module directory with 3 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `server`

## Files (3)

- `src/lib/server/observability/inference-log-views.ts`
- `src/lib/server/observability/inference-log.ts`
- `src/lib/server/observability/langfuse.ts`

## Hypergraph cluster

This directory is part of cluster **C59** — function chunks in \`src/lib/server/observability\` (tag: vector)

- **Top kinds**: function×5
- **Top tags**: `vector` `embedding` `auth`

See `docs/graph/hypergraph-clusters.md` § Cluster 59 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C59 — function chunks in `src/lib/server/observability` (tag: vector)
- **BoW texture key**: `texture:bow:cluster:59` (Redis 1h TTL)
- **Qdrant tags**: `vector` `embedding` `auth`
- **Paired tests**: 0/3 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "observability", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server observability", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/observability/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 59 })` — BoW texture tile for cluster C59
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 59 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
