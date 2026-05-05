# AGENTS.md — `src/lib/utils`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/utils

## Snapshot

- shared library directory with 42 files, 0 API handlers, 1 SSR-unsafe
- Audit score: **75/100**
- 🔴 SSR-unsafe: 1 · 🟠 hardcoded localhost: 4
- Tags: `src` `lib` `utils` `zod` `ssr-unsafe` `auth`

## Files (42)

- `accessibility-validator.ts`
- `accessibility.ts`
- `accessibleClick.ts`
- `api-endpoints.ts`
- `bits-ui-adapter.ts`
- `buffer-conversion.ts`
- `case-logic.ts`
- `cn.ts`

## Hypergraph cluster

This directory is part of cluster **C1** — type chunks in \`src/lib/utils\` (tag: page-component)

- **Top kinds**: type×4, function×1, component×1
- **Top tags**: `page-component` `auth` `ui-component` `server-module` `types`

See `docs/graph/hypergraph-clusters.md` § Cluster 1 for full digest.

## Warnings

- ⚠️ 1 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "utils", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib utils", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/utils/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
