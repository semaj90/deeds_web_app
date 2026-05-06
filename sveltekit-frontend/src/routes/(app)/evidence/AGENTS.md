# AGENTS.md — `src/routes/(app)/evidence`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/(app)/evidence

## Snapshot

- route handler directory with 14 files, 1 API handlers, 3 Drizzle refs
- Audit score: **100/100**
- Auth: 1/1 · Zod: 1/1 · tests paired: 1/1
- Tags: `src` `routes` `(app)` `route` `component` `auth`

## Files (6)

- `src/routes/(app)/evidence/+layout.svelte`
- `src/routes/(app)/evidence/+page.server.ts`
- `src/routes/(app)/evidence/+page.svelte`
- `src/routes/(app)/evidence/+page.ts`
- `src/routes/(app)/evidence/+server.ts`

## Hypergraph cluster

This directory is part of cluster **C29** — const chunks in \`src/lib/schemas\` (tag: auth)

- **Top kinds**: const×7, type×5, function×3
- **Top tags**: `auth` `types` `embedding` `vector` `redis`

See `docs/graph/hypergraph-clusters.md` § Cluster 29 for full digest.

## Warnings

- ⚠️ 1 routes lack test pairing

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C29 — const chunks in `src/lib/schemas` (tag: auth)
- **BoW texture key**: `texture:bow:cluster:29` (Redis 1h TTL)
- **Qdrant tags**: `auth` `types` `embedding` `vector` `redis`
- **Paired tests**: 1/1 route files paired

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "evidence", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "(app) evidence", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/evidence/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 29 })` — BoW texture tile for cluster C29
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 29 } })` — semantic search scoped to this cluster
For route handlers in this dir, also try:
- `verify_fix({ filePath: "src/routes/(app)/evidence/+server.ts" })` — runs svelte-check / tsc on a single file

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
