# AGENTS.md — `src/routes/(app)/cases/[id]/evidence/upload`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory: src/routes/(app)/cases/[id]/evidence/upload

## Snapshot

- 2 file(s), 0 handler(s)
- Audit score: **98/100**
- no audit signals


## Files (2)

- `+page.server.ts`
- `+page.svelte`

## Hypergraph cluster

This directory is part of cluster **C92** — component chunks in \`src/lib/components/evidence\` (tag: embedding)

- **Top kinds**: component×14, const×1, function×1
- **Top tags**: `embedding` `page` `component` `xstate`

See `docs/graph/hypergraph-clusters.md` § Cluster 92 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C92 — component chunks in `src/lib/components/evidence` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:92` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `page` `component` `xstate`
- **Paired tests**: 1/2 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "upload", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "evidence upload", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/cases/[id]/evidence/upload/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 92 })` — BoW texture tile for cluster C92
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 92 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
