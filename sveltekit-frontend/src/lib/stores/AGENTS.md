# AGENTS.md — `src/lib/stores`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/stores

## Snapshot

- shared library directory with 14 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `stores` `zod`

## Files (14)

- `src/lib/stores/analysis-panel.svelte.ts`
- `src/lib/stores/analytics.svelte.ts`
- `src/lib/stores/app-store.svelte.ts`
- `src/lib/stores/appState.svelte.ts`
- `src/lib/stores/auth-store.svelte.ts`

## Hypergraph cluster

This directory is part of cluster **C52** — const chunks in \`src/lib/stores/unified\` (tag: server-module)

- **Top kinds**: const×16
- **Top tags**: `server-module` `cache` `config` `embedding` `auth`

See `docs/graph/hypergraph-clusters.md` § Cluster 52 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C52 — const chunks in `src/lib/stores/unified` (tag: server-module)
- **BoW texture key**: `texture:bow:cluster:52` (Redis 1h TTL)
- **Qdrant tags**: `server-module` `cache` `config` `embedding` `auth`
- **Paired tests**: 1/14 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "stores", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib stores", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/stores/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 52 })` — BoW texture tile for cluster C52
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 52 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
