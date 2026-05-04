# AGENTS.md — `src/lib/server/analytics`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/analytics

## Snapshot

- server module directory with 15 files, 0 API handlers, 5 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `zod` `db-schema` `test`

## Files (15)

- `agentic-web-indexer.ts`
- `architectural-guard.ts`
- `codebase-research.ts`
- `deep-research.ts`
- `event-logger.ts`
- `mapreduce-matrix-analysis.ts`
- `minified-research-cache.ts`
- `research-cache.ts`

## Hypergraph cluster

This directory is part of cluster **C60** — function chunks in \`src/lib/server/analytics\` (tag: embedding)

- **Top kinds**: function×5, table-def×3, type×1
- **Top tags**: `embedding` `redis` `vector` `database` `schema`

See `docs/graph/hypergraph-clusters.md` § Cluster 60 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "analytics", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server analytics", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/analytics/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
