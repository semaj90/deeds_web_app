# AGENTS.md — `src/lib/server/config`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/config

## Snapshot

- server module directory with 4 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `server` `zod`

## Files (4)

- `src/lib/server/config/dynamic-ports.ts`
- `src/lib/server/config/endpoints.ts`
- `src/lib/server/config/ollama.ts`
- `src/lib/server/config/vector-config.ts`

## Hypergraph cluster

This directory is part of cluster **C75** — function chunks in \`src/lib/config\` (tag: embedding)

- **Top kinds**: function×12, const×3, type×1
- **Top tags**: `embedding` `vector` `redis` `rabbitmq` `ai`

See `docs/graph/hypergraph-clusters.md` § Cluster 75 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C75 — function chunks in `src/lib/config` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:75` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `vector` `redis` `rabbitmq` `ai`
- **Paired tests**: 1/4 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "config", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server config", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/config/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 75 })` — BoW texture tile for cluster C75
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 75 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
