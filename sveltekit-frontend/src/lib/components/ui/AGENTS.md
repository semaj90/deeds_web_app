# AGENTS.md — `src/lib/components/ui`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/ui

## Snapshot

- shared library directory with 245 files, 0 API handlers, 3 TODOs
- Audit score: **75/100**
- TODOs: 1
- Tags: `src` `lib` `components` `component` `has-todo` `zod`

## Files (89)

- `src/lib/components/ui/AccessibilityPanel.svelte`
- `src/lib/components/ui/AccessibilitySettings.svelte`
- `src/lib/components/ui/AdaptiveRenderingEngine.svelte`
- `src/lib/components/ui/AIDialog.svelte`
- `src/lib/components/ui/AIDropdown.svelte`

## Hypergraph cluster

This directory is part of cluster **C34** — component chunks in \`src/routes/(app)/demos/celestial-icons\` (tag: page)

- **Top kinds**: component×3
- **Top tags**: `page` `component`

See `docs/graph/hypergraph-clusters.md` § Cluster 34 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C34 — component chunks in `src/routes/(app)/demos/celestial-icons` (tag: page)
- **BoW texture key**: `texture:bow:cluster:34` (Redis 1h TTL)
- **Qdrant tags**: `page` `component`
- **Paired tests**: 1/89 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "ui", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components ui", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/ui/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 34 })` — BoW texture tile for cluster C34
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 34 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
