# AGENTS.md — `src/lib/components/ui/gaming/n64`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory: src/lib/components/ui/gaming/n64

## Snapshot

- 35 file(s), 0 handler(s)
- Audit score: _(no GPU audit)_
- no audit signals


## Files (35)

- `Card.svelte`
- `Dialog.svelte`
- `HTML5Canvas.svelte`
- `index.ts`
- `Input.svelte`
- `N643DButton.svelte`
- `N643DContainer.svelte`
- `N643DDialog.svelte`

## Hypergraph cluster

This directory is part of cluster **C50** — component chunks in \`src/lib/components/ui/gaming/n64\` (tag: page)

- **Top kinds**: component×14, unknown×2
- **Top tags**: `page` `component`

See `docs/graph/hypergraph-clusters.md` § Cluster 50 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C50 — component chunks in `src/lib/components/ui/gaming/n64` (tag: page)
- **BoW texture key**: `texture:bow:cluster:50` (Redis 1h TTL)
- **Qdrant tags**: `page` `component`
- **Paired tests**: 1/35 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "n64", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "gaming n64", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/ui/gaming/n64/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 50 })` — BoW texture tile for cluster C50
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 50 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
