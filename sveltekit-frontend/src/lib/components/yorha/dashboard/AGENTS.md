# AGENTS.md — `src/lib/components/yorha/dashboard`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/yorha/dashboard

## Snapshot

- src/lib/components/yorha/dashboard/ActiveCasesWidget.svelte, src/lib/components/yorha/dashboard/EvidenceStats.svelte, src/lib/components/yorha/dashboard/GPUMetrics.svelte, src/lib/components/yorha/dashboard/RecentActivity.svelte, src/lib/components/yorha/dashboard/SystemOverview.svelte
- Audit score: **20/100** ⚠️
- TODOs: 1
- Tags: `dashboard` `low-score` `has-errors`

## Files (10)

- `ActiveCasesWidget.svelte`
- `EvidenceStats.svelte`
- `GPUMetrics.svelte`
- `RecentActivity.svelte`
- `SystemOverview.svelte`
- `ActiveCasesWidget.svelte`
- `EvidenceStats.svelte`
- `RecentActivity.svelte`

## Warnings

- ⚠️ Score 20 below threshold

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "dashboard", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "yorha dashboard", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/yorha/dashboard/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
