# AGENTS.md — `src/routes/(analysis)/video-analysis/[evidenceId]`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/(analysis)/video-analysis/[evidenceId]

## Snapshot

- src/routes/(analysis)/video-analysis/[evidenceId]/+page.server.ts, src/routes/(analysis)/video-analysis/[evidenceId]/+page.svelte
- Audit score: **60/100** ⚠️
- no audit signals
- Tags: `[evidenceId]`

## Files (3)

- `+page.server.ts`
- `+page.svelte`
- `+page.server.ts`


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "[evidenceId]", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "video-analysis [evidenceId]", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(analysis)/video-analysis/[evidenceId]/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
