# AGENTS.md — `src/lib/components/ui/alert-dialog`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory: src/lib/components/ui/alert-dialog

## Snapshot

- 14 file(s), 0 handler(s)
- Audit score: _(no GPU audit)_
- no audit signals


## Files (14)

- `AlertDialog.svelte`
- `AlertDialogAction.svelte`
- `AlertDialogCancel.svelte`
- `AlertDialogContent.svelte`
- `AlertDialogDescription.svelte`
- `AlertDialogFooter.svelte`
- `AlertDialogHeader.svelte`
- `AlertDialogOverlay.svelte`

## Hypergraph cluster

This directory is part of cluster **C4** — type chunks in \`src/lib/components/ui/dialog\` (tag: vector)

- **Top kinds**: type×16
- **Top tags**: `vector` `redis` `embedding` `page-component` `ui-component`

See `docs/graph/hypergraph-clusters.md` § Cluster 4 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C4 — type chunks in `src/lib/components/ui/dialog` (tag: vector)
- **BoW texture key**: `texture:bow:cluster:4` (Redis 1h TTL)
- **Qdrant tags**: `vector` `redis` `embedding` `page-component` `ui-component`
- **Paired tests**: 1/14 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "alert-dialog", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "ui alert-dialog", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/ui/alert-dialog/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 4 })` — BoW texture tile for cluster C4
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 4 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
