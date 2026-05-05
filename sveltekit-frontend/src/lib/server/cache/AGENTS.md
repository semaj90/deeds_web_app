# AGENTS.md — `src/lib/server/cache`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/cache

## Snapshot

- server module directory with 8 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `server` `zod`

## Files (8)

- `cache-events.ts`
- `cartridge-tensor-bridge.ts`
- `dag-cache.ts`
- `invalidation.ts`
- `pdf-export-cache.ts`
- `redis-exact-match.ts`
- `report-template-cache.ts`
- `warm-up.ts`

## Hypergraph cluster

This directory is part of cluster **C22** — function chunks in \`src/lib/server/cache\` (tag: redis)

- **Top kinds**: function×13
- **Top tags**: `redis` `vector` `embedding` `cache` `rabbitmq`

See `docs/graph/hypergraph-clusters.md` § Cluster 22 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "cache", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server cache", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/cache/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
