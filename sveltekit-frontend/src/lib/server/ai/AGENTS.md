# AGENTS.md — `src/lib/server/ai`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/ai

## Snapshot

- server module directory with 32 files, 0 API handlers, 5 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `zod` `db-schema` `auth`

## Files (32)

- `src/lib/server/ai/ab-test.ts`
- `src/lib/server/ai/cached-stream.ts`
- `src/lib/server/ai/caching-layer.ts`
- `src/lib/server/ai/code-intel-service.ts`
- `src/lib/server/ai/compact-budgets.ts`

## Hypergraph cluster

This directory is part of cluster **C19** — type chunks in \`src/lib/types\` (tag: embedding)

- **Top kinds**: type×16
- **Top tags**: `embedding` `vector` `redis` `rabbitmq` `ai`

See `docs/graph/hypergraph-clusters.md` § Cluster 19 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C19 — type chunks in `src/lib/types` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:19` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `vector` `redis` `rabbitmq` `ai`
- **Paired tests**: 2/32 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "ai", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server ai", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/ai/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 19 })` — BoW texture tile for cluster C19
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 19 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
