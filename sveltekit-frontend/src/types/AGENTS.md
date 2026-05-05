# AGENTS.md — `src/types`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/types

## Snapshot

- module directory with 23 files, 0 API handlers, 2 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `types` `ai-bridge.d.ts` `ambient.d.ts` `db-schema` `cbor.d.ts`

## Files (23)

- `ai-bridge.d.ts`
- `ambient.d.ts`
- `cbor.d.ts`
- `chartjs.d.ts`
- `components.d.ts`
- `d3.d.ts`
- `embeddinggemma.d.ts`
- `global-shims.d.ts`


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "types", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "src types", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/types/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
