# AGENTS.md — `src/lib/server/db`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/db

## Snapshot

- server module directory with 111 files, 0 API handlers, 92 Drizzle refs
- Audit score: **95/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `server` `db-schema` `zod` `json`

## Files (70)

- `src/lib/server/db/additional-tables.ts`
- `src/lib/server/db/cases.ts`
- `src/lib/server/db/client.ts`
- `src/lib/server/db/connection.ts`
- `src/lib/server/db/connections.ts`

## Hypergraph cluster

This directory is part of cluster **C6** — function chunks in \`src/lib/server/db\` (tag: embedding)

- **Top kinds**: function×15, class×1
- **Top tags**: `embedding` `database` `vector` `auth` `vector-search`

See `docs/graph/hypergraph-clusters.md` § Cluster 6 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C6 — function chunks in `src/lib/server/db` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:6` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `database` `vector` `auth` `vector-search`
- **Paired tests**: 4/70 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "db", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server db", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/db/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 6 })` — BoW texture tile for cluster C6
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 6 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
