# AGENTS.md — `src/routes/(app)/library`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T23:09:49.059Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/(app)/library

## Snapshot

- route handler directory with 13 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `routes` `(app)` `route` `component` `auth`

## Files (3)

- `src/routes/(app)/library/+layout.svelte`
- `src/routes/(app)/library/+page.server.ts`
- `src/routes/(app)/library/+page.svelte`
- `src/routes/(app)/library/corpus/+page.server.ts`
- `src/routes/(app)/library/corpus/+page.svelte`

## Warnings

- ⚠️ 5 routes lack test pairing

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 0/3 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "library", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "(app) library", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/library/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
