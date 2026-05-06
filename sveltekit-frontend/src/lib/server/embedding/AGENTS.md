# AGENTS.md — `src/lib/server/embedding`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/embedding

## Snapshot

- server module directory with 9 files, 0 API handlers, 1 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `db-schema` `zod`

## Files (9)

- `src/lib/server/embedding/embed-schema.ts`
- `src/lib/server/embedding/embed.ts`
- `src/lib/server/embedding/embedding-persist.ts`
- `src/lib/server/embedding/embedding-repository.ts`
- `src/lib/server/embedding/ingestion-queue.ts`

## Hypergraph cluster

This directory is part of cluster **C77** — type chunks in \`src/lib/types\` (tag: embedding)

- **Top kinds**: type×16
- **Top tags**: `embedding` `vector` `redis` `auth` `rabbitmq`

See `docs/graph/hypergraph-clusters.md` § Cluster 77 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C77 — type chunks in `src/lib/types` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:77` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `vector` `redis` `auth` `rabbitmq`
- **Paired tests**: 1/9 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "embedding", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server embedding", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/embedding/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 77 })` — BoW texture tile for cluster C77
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 77 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
