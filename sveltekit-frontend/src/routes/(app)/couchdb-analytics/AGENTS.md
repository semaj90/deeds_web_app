# AGENTS.md — `src/routes/(app)/couchdb-analytics`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/(app)/couchdb-analytics

## Snapshot

- route handler directory with 5 files, 0 API handlers
- Audit score: **85/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `routes` `(app)` `route` `component` `auth`

## Files (5)

- `+page.svelte`
- `ClusterInspector.svelte`
- `DependencyChart.svelte`
- `ErrorPropagationGraph.svelte`
- `SummaryCard.svelte`

## Warnings

- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "couchdb-analytics", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "(app) couchdb-analytics", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/couchdb-analytics/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
