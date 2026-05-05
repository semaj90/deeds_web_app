# AGENTS.md — `src/routes/(app)/admin/component-analysis`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/(app)/admin/component-analysis

## Snapshot

- src/routes/(app)/admin/component-analysis/+page.svelte, src/routes/(app)/admin/component-analysis/+page.ts
- Audit score: **30/100** ⚠️
- TODOs: 2
- Tags: `component-analysis` `low-score` `has-errors`

## Files (2)

- `+page.svelte`
- `+page.ts`

## Warnings

- ⚠️ Score 30 below threshold

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "component-analysis", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "admin component-analysis", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/admin/component-analysis/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
