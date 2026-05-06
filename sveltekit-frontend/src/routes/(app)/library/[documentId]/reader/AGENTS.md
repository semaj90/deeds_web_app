# AGENTS.md — `src/routes/(app)/library/[documentId]/reader`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory: src/routes/(app)/library/[documentId]/reader

## Snapshot

- 2 file(s), 0 handler(s)
- Audit score: **96/100**
- no audit signals


## Files (2)

- `+page.server.ts`
- `+page.svelte`

## Hypergraph cluster

This directory is part of cluster **C8** — route-handler chunks in \`src/routes/api/library/documents/[documentId]/toc\` (tag: api)

- **Top kinds**: route-handler×13, const×3
- **Top tags**: `api` `server` `page-server` `ssr` `vector`

See `docs/graph/hypergraph-clusters.md` § Cluster 8 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C8 — route-handler chunks in `src/routes/api/library/documents/[documentId]/toc` (tag: api)
- **BoW texture key**: `texture:bow:cluster:8` (Redis 1h TTL)
- **Qdrant tags**: `api` `server` `page-server` `ssr` `vector`
- **Paired tests**: 0/2 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "reader", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "[documentId] reader", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/library/[documentId]/reader/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 8 })` — BoW texture tile for cluster C8
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 8 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
