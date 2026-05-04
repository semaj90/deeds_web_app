# AGENTS.md — `src/lib/components/ui/progress`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/ui/progress

## Snapshot

- src/lib/components/ui/progress/index.ts, src/lib/components/ui/progress/Progress.svelte, src/lib/components/ui/progress/ProgressIndicator.svelte, src/lib/components/ui/progress/ProgressRoot.svelte, src/lib/components/ui/progress/Svelte5Progress.svelte
- Audit score: **50/100** ⚠️
- no audit signals
- Tags: `progress`

## Files (5)

- `index.ts`
- `Progress.svelte`
- `ProgressIndicator.svelte`
- `ProgressRoot.svelte`
- `Svelte5Progress.svelte`


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "progress", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "ui progress", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/ui/progress/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
