# AGENTS.md — `src/lib/components`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components

## Snapshot

- shared library directory with 56 files, 0 API handlers, 1 Drizzle refs, 6 TODOs
- Audit score: **80/100**
- 🟠 hardcoded localhost: 2 · TODOs: 2
- Tags: `src` `lib` `components` `component` `zod` `db-schema`

## Files (56)

- `src/lib/components/ActionPopup.svelte`
- `src/lib/components/AIChatAssistant.svelte`
- `src/lib/components/APITesterModal.svelte`
- `src/lib/components/ArchivedRoutesPanel.svelte`
- `src/lib/components/CanvasEditor.svelte`

## Hypergraph cluster

This directory is part of cluster **C92** — component chunks in \`src/lib/components/evidence\` (tag: embedding)

- **Top kinds**: component×14, const×1, function×1
- **Top tags**: `embedding` `page` `component` `xstate`

See `docs/graph/hypergraph-clusters.md` § Cluster 92 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C92 — component chunks in `src/lib/components/evidence` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:92` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `page` `component` `xstate`
- **Paired tests**: 0/56 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "components", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib components", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 92 })` — BoW texture tile for cluster C92
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 92 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
