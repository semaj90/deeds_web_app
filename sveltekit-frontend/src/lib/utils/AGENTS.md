# AGENTS.md — `src/lib/utils`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/utils

## Snapshot

- shared library directory with 42 files, 0 API handlers
- Audit score: **85/100**
- 🟠 hardcoded localhost: 4
- Tags: `src` `lib` `utils` `zod` `auth`

## Files (42)

- `src/lib/utils/accessibility-validator.ts`
- `src/lib/utils/accessibility.ts`
- `src/lib/utils/accessibleClick.ts`
- `src/lib/utils/api-endpoints.ts`
- `src/lib/utils/bits-ui-adapter.ts`

## Hypergraph cluster

This directory is part of cluster **C1** — type chunks in \`src/lib/utils\` (tag: page-component)

- **Top kinds**: type×4, function×1, component×1
- **Top tags**: `page-component` `auth` `ui-component` `server-module` `types`

See `docs/graph/hypergraph-clusters.md` § Cluster 1 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C1 — type chunks in `src/lib/utils` (tag: page-component)
- **BoW texture key**: `texture:bow:cluster:1` (Redis 1h TTL)
- **Qdrant tags**: `page-component` `auth` `ui-component` `server-module` `types`
- **Paired tests**: 3/42 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "utils", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib utils", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/utils/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 1 })` — BoW texture tile for cluster C1
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 1 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
