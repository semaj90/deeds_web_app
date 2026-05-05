# AGENTS.md — `src/lib/components/ui/alert-dialog`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/ui/alert-dialog

## Snapshot

- src/lib/components/ui/alert-dialog/AlertDialog.svelte, src/lib/components/ui/alert-dialog/AlertDialogAction.svelte, src/lib/components/ui/alert-dialog/AlertDialogCancel.svelte, src/lib/components/ui/alert-dialog/AlertDialogContent.svelte, src/lib/components/ui/alert-dialog/AlertDialogDescription.svelte
- Audit score: **50/100** ⚠️
- no audit signals
- Tags: `alert-dialog`

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


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "alert-dialog", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "ui alert-dialog", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/ui/alert-dialog/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
