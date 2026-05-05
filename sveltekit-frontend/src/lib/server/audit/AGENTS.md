# AGENTS.md — `src/lib/server/audit`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/audit

## Snapshot

- server module directory with 4 files, 0 API handlers, 2 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `db-schema` `zod`

## Files (4)

- `api-audit-buffer.ts`
- `evidence-audit.ts`
- `gemma-tool-router.ts`
- `gpu-audit-orchestrator.ts`

## Hypergraph cluster

This directory is part of cluster **C84** — function chunks in \`src/lib/server/audit\` (tag: vector)

- **Top kinds**: function×4, type×1, table-def×1
- **Top tags**: `vector` `embedding` `database` `schema` `drizzle`

See `docs/graph/hypergraph-clusters.md` § Cluster 84 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "audit", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server audit", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/audit/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
