# AGENTS.md — `src/lib/components/legal`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/legal

## Snapshot

- shared library directory with 33 files, 0 API handlers, 2 SSR-unsafe
- Audit score: **80/100**
- 🔴 SSR-unsafe: 2
- Tags: `src` `lib` `components` `component` `ssr-unsafe` `zod`

## Files (33)

- `AISummaryMiniModal.svelte`
- `AISummaryReader.svelte`
- `CaseTimeline.svelte`
- `ChainOfCustodyTracker.svelte`
- `CitationDrawer.svelte`
- `CitationManager.svelte`
- `CitationSaveTooltip.svelte`
- `CitedSourcesOverlay.svelte`

## Hypergraph cluster

This directory is part of cluster **C35** — component chunks in \`src/lib/components/legal-ai\` (tag: component)

- **Top kinds**: component×16
- **Top tags**: `component` `page` `vector` `layout`

See `docs/graph/hypergraph-clusters.md` § Cluster 35 for full digest.

## Warnings

- ⚠️ 2 SSR-unsafe globals

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "legal", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components legal", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/legal/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
