# AGENTS.md — `src/routes/(app)/admin/knowledge-search`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory: src/routes/(app)/admin/knowledge-search

## Snapshot

- 2 file(s), 0 handler(s)
- Audit score: **96/100**
- no audit signals


## Files (2)

- `+page.server.ts`
- `+page.svelte`

## Hypergraph cluster

This directory is part of cluster **C83** — const chunks in \`src/routes/(app)/admin/dev-tools\` (tag: page-server)

- **Top kinds**: const×14, component×1, type×1
- **Top tags**: `page-server` `ssr` `embedding` `vector` `redis`

See `docs/graph/hypergraph-clusters.md` § Cluster 83 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C83 — const chunks in `src/routes/(app)/admin/dev-tools` (tag: page-server)
- **BoW texture key**: `texture:bow:cluster:83` (Redis 1h TTL)
- **Qdrant tags**: `page-server` `ssr` `embedding` `vector` `redis`
- **Paired tests**: 0/2 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "knowledge-search", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "admin knowledge-search", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/admin/knowledge-search/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 83 })` — BoW texture tile for cluster C83
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 83 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
