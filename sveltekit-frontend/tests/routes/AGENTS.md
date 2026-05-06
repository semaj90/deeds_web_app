# AGENTS.md — `tests/routes`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: tests/routes

## Snapshot

- module directory with 30 files, 2 API handlers, 6 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `tests` `routes` `ace-wiki-graph-index.test.ts` `test` `ai-models.test.ts` `all-routes-page-server.test.ts`

## Files (30)

- `tests/routes/ace-wiki-graph-index.test.ts`
- `tests/routes/ai-models.test.ts`
- `tests/routes/all-routes-page-server.test.ts`
- `tests/routes/all-routes-page.test.ts`
- `tests/routes/cache-stats.test.ts`


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 0/30 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "routes", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "tests routes", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "tests/routes/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
