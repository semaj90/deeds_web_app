# AGENTS.md — `src/lib/server/db`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/db

## Snapshot

- server module directory with 106 files, 0 API handlers, 87 Drizzle refs
- Audit score: **95/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `server` `db-schema` `zod` `json`

## Files (70)

- `additional-tables.ts`
- `cases.ts`
- `client.ts`
- `connection.ts`
- `connections.ts`
- `drizzle-cache.ts`
- `drizzle.ts`
- `enhanced-legal-schema.ts`

## Hypergraph cluster

This directory is part of cluster **C6** — function chunks in \`src/lib/server/db\` (tag: embedding)

- **Top kinds**: function×15, class×1
- **Top tags**: `embedding` `database` `vector` `auth` `vector-search`

See `docs/graph/hypergraph-clusters.md` § Cluster 6 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "db", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server db", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/db/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
