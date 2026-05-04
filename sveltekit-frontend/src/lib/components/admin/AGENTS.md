# AGENTS.md — `src/lib/components/admin`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/admin

## Snapshot

- shared library directory with 5 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `components` `component` `zod`

## Files (5)

- `BundlePreview.svelte`
- `EvidenceDataGrid.svelte`
- `EvidenceDrawer.svelte`
- `PipelineProgress.svelte`
- `TagSelector.svelte`

## Hypergraph cluster

This directory is part of cluster **C7** — component chunks in \`src/lib/components/admin\`

- **Top kinds**: component×1


See `docs/graph/hypergraph-clusters.md` § Cluster 7 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "admin", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components admin", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/admin/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
