# AGENTS.md — `src/routes/(app)/cases`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/(app)/cases

## Snapshot

- route handler directory with 39 files, 0 API handlers, 9 Drizzle refs, 2 SSR-unsafe
- Audit score: **90/100**
- no audit signals
- Tags: `src` `routes` `(app)` `route` `db-schema` `auth`

## Files (4)

- `+page.server.ts`
- `+page.svelte`
- `+page.ts`
- `schema.ts`

## Warnings

- ⚠️ 2 SSR-unsafe globals
- ⚠️ 14 routes lack test pairing

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "cases", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "(app) cases", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/cases/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
