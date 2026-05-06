# AGENTS.md — `src/lib/server/utils`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/utils

## Snapshot

- server module directory with 13 files, 0 API handlers
- Audit score: **85/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `server` `zod`

## Files (13)

- `src/lib/server/utils/avatar-upload.ts`
- `src/lib/server/utils/endpoints.ts`
- `src/lib/server/utils/extract-component.ts`
- `src/lib/server/utils/graceful-error-handler.ts`
- `src/lib/server/utils/http-error-mapper.ts`

## Hypergraph cluster

This directory is part of cluster **C19** — type chunks in \`src/lib/types\` (tag: embedding)

- **Top kinds**: type×16
- **Top tags**: `embedding` `vector` `redis` `rabbitmq` `ai`

See `docs/graph/hypergraph-clusters.md` § Cluster 19 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C19 — type chunks in `src/lib/types` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:19` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `vector` `redis` `rabbitmq` `ai`
- **Paired tests**: 0/13 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "utils", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server utils", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/utils/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 19 })` — BoW texture tile for cluster C19
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 19 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
