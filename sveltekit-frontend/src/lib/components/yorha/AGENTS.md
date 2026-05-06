# AGENTS.md — `src/lib/components/yorha`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T23:09:49.059Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/yorha

## Snapshot

- shared library directory with 72 files, 0 API handlers, 1 TODOs
- Audit score: **78/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `components` `component` `has-todo` `zod`

## Files (38)

- `src/lib/components/yorha/cases/CaseFilters.svelte`
- `src/lib/components/yorha/cases/CasesList.svelte`
- `src/lib/components/yorha/cases/CaseStats.svelte`
- `src/lib/components/yorha/CaseTheoryConstructor.svelte`
- `src/lib/components/yorha/ContradictionReveal.svelte`

## Warnings

- ⚠️ Hardcoded localhost refs

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 0/38 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "yorha", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components yorha", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/yorha/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
