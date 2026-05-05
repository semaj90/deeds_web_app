# AGENTS.md — `tests/routes`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: tests/routes

## Snapshot

- module directory with 30 files, 2 API handlers, 6 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `tests` `routes` `ace-wiki-graph-index.test.ts` `test` `ai-models.test.ts` `all-routes-page-server.test.ts`

## Files (30)

- `ace-wiki-graph-index.test.ts`
- `ai-models.test.ts`
- `all-routes-page-server.test.ts`
- `all-routes-page.test.ts`
- `cache-stats.test.ts`
- `cases-canvas.test.ts`
- `chat-memory-backfill.test.ts`
- `chat-memory-search.test.ts`


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "routes", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "tests routes", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "tests/routes/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
