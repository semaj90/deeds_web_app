# AGENTS.md — `src/lib/db/schema`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/db/schema

## Snapshot

- shared library directory with 6 files, 0 API handlers, 6 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `db` `db-schema`

## Files (6)

- `ace-web.ts`
- `cutlass.ts`
- `evidence.ts`
- `gpuInferenceDemo.ts`
- `route-health-tables.ts`
- `yorha.ts`

## Hypergraph cluster

This directory is part of cluster **C51** — table-def chunks in \`src/lib/db/schema\` (tag: database)

- **Top kinds**: table-def×3
- **Top tags**: `database` `schema` `drizzle` `vector` `redis`

See `docs/graph/hypergraph-clusters.md` § Cluster 51 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "schema", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "db schema", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/db/schema/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
