# AGENTS.md — `src/lib/types`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/types

## Snapshot

- shared library directory with 51 files, 0 API handlers, 1 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `types` `db-schema` `zod`

## Files (51)

- `advanced-patches.d.ts`
- `agent.ts`
- `ai.ts`
- `api.ts`
- `app.d.ts`
- `auth.d.ts`
- `case-summary.ts`
- `case-theory.ts`

## Hypergraph cluster

This directory is part of cluster **C77** — type chunks in \`src/lib/types\` (tag: embedding)

- **Top kinds**: type×16
- **Top tags**: `embedding` `vector` `redis` `auth` `rabbitmq`

See `docs/graph/hypergraph-clusters.md` § Cluster 77 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "types", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib types", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/types/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
