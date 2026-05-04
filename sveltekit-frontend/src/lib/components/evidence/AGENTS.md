# AGENTS.md — `src/lib/components/evidence`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/evidence

## Snapshot

- shared library directory with 41 files, 0 API handlers, 2 SSR-unsafe
- Audit score: **80/100**
- 🔴 SSR-unsafe: 2
- Tags: `src` `lib` `components` `component` `zod` `ssr-unsafe`

## Files (41)

- `board-history.svelte.ts`
- `board-persistence.svelte.ts`
- `BoardMinimap.svelte`
- `BoardSearchOverlay.svelte`
- `CaseEvidenceOrganizer.svelte`
- `DoclingExtractionViewer.svelte`
- `DraggableEvidenceNode.svelte`
- `evidence-utils.ts`

## Hypergraph cluster

This directory is part of cluster **C86** — function chunks in \`src/lib/components/evidence\` (tag: embedding)

- **Top kinds**: function×14, const×2
- **Top tags**: `embedding` `server-module` `vector` `page-component` `redis`

See `docs/graph/hypergraph-clusters.md` § Cluster 86 for full digest.

## Warnings

- ⚠️ 2 SSR-unsafe globals

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "evidence", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components evidence", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/evidence/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
