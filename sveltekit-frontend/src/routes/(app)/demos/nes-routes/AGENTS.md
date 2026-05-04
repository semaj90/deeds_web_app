# AGENTS.md — `src/routes/(app)/demos/nes-routes`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/(app)/demos/nes-routes

## Snapshot

- src/routes/(app)/demos/nes-routes/+page.server.ts, src/routes/(app)/demos/nes-routes/+page.svelte
- Audit score: **60/100** ⚠️
- no audit signals
- Tags: `nes-routes`

## Files (2)

- `+page.server.ts`
- `+page.svelte`


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "nes-routes", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "demos nes-routes", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/demos/nes-routes/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
