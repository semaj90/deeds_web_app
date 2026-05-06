# AGENTS.md — `src/lib/server/ml`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/ml

## Snapshot

- server module directory with 8 files, 0 API handlers, 3 Drizzle refs
- Audit score: **95/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `server` `db-schema`

## Files (8)

- `src/lib/server/ml/feedback-store.ts`
- `src/lib/server/ml/multi-modal-ranker.ts`
- `src/lib/server/ml/recommendation-glyph.ts`
- `src/lib/server/ml/recommendation-metrics.ts`
- `src/lib/server/ml/som-cluster.ts`

## Hypergraph cluster

This directory is part of cluster **C69** — route-handler chunks in \`src/routes/(app)/admin/api-testing/agentic-loop\` (tag: api)

- **Top kinds**: route-handler×5, function×1
- **Top tags**: `api` `server` `vector` `embedding` `xstate`

See `docs/graph/hypergraph-clusters.md` § Cluster 69 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C69 — route-handler chunks in `src/routes/(app)/admin/api-testing/agentic-loop` (tag: api)
- **BoW texture key**: `texture:bow:cluster:69` (Redis 1h TTL)
- **Qdrant tags**: `api` `server` `vector` `embedding` `xstate`
- **Paired tests**: 0/8 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "ml", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server ml", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/ml/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 69 })` — BoW texture tile for cluster C69
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 69 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
