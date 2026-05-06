# AGENTS.md — `src/lib/server/audit`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/audit

## Snapshot

- server module directory with 4 files, 0 API handlers, 2 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `db-schema` `zod`

## Files (4)

- `src/lib/server/audit/api-audit-buffer.ts`
- `src/lib/server/audit/evidence-audit.ts`
- `src/lib/server/audit/gemma-tool-router.ts`
- `src/lib/server/audit/gpu-audit-orchestrator.ts`

## Hypergraph cluster

This directory is part of cluster **C84** — function chunks in \`src/lib/server/audit\` (tag: vector)

- **Top kinds**: function×4, type×1, table-def×1
- **Top tags**: `vector` `embedding` `database` `schema` `drizzle`

See `docs/graph/hypergraph-clusters.md` § Cluster 84 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C84 — function chunks in `src/lib/server/audit` (tag: vector)
- **BoW texture key**: `texture:bow:cluster:84` (Redis 1h TTL)
- **Qdrant tags**: `vector` `embedding` `database` `schema` `drizzle`
- **Paired tests**: 0/4 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "audit", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server audit", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/audit/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 84 })` — BoW texture tile for cluster C84
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 84 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
