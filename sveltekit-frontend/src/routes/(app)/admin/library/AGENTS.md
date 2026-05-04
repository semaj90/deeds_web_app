# AGENTS.md — `src/routes/(app)/admin/library`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/(app)/admin/library

## Snapshot

- src/routes/(app)/admin/library/+page.svelte, src/routes/(app)/admin/library/+page.ts
- Audit score: **60/100** ⚠️
- 🟠 hardcoded localhost: 1
- Tags: `library`

## Files (47)

- `+page.svelte`
- `+page.ts`
- `+page.ts`
- `+page.ts`
- `+page.ts`
- `+page.ts`
- `+page.ts`
- `+page.ts`


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "library", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "admin library", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/admin/library/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
