# AGENTS.md — `src/lib/server`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server

## Snapshot

- server module directory with 62 files, 3 API handlers, 155 Drizzle refs
- Audit score: **100/100**
- 🟠 hardcoded localhost: 5
- Tags: `src` `lib` `server` `zod` `db-schema` `test`

## Files (62)

- `src/lib/server/ace-ingest-progress.ts`
- `src/lib/server/api-metadata-extractor.ts`
- `src/lib/server/api-registry.ts`
- `src/lib/server/api-response.ts`
- `src/lib/server/auth-guard.js`

## Hypergraph cluster

This directory is part of cluster **C90** — function chunks in \`src/lib/server\` (tag: auth)

- **Top kinds**: function×9, route-handler×4, const×1
- **Top tags**: `auth` `api` `server`

See `docs/graph/hypergraph-clusters.md` § Cluster 90 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C90 — function chunks in `src/lib/server` (tag: auth)
- **BoW texture key**: `texture:bow:cluster:90` (Redis 1h TTL)
- **Qdrant tags**: `auth` `api` `server`
- **Paired tests**: 9/62 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "server", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib server", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 90 })` — BoW texture tile for cluster C90
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 90 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
