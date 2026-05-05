# AGENTS.md — `src/lib/server/evidence`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/evidence

## Snapshot

- server module directory with 14 files, 0 API handlers, 2 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `test` `zod` `db-schema`

## Files (9)

- `batch-entity-embedder.ts`
- `batch-entity-storer.ts`
- `docling-structure.test.ts`
- `docling-structure.ts`
- `proto-serializer.ts`
- `rabbitmq.ts`
- `type-detector.ts`
- `worker-embed.ts`

## Hypergraph cluster

This directory is part of cluster **C66** — type chunks in \`src/lib/server/services\` (tag: types)

- **Top kinds**: type×12
- **Top tags**: `types` `redis` `embedding` `server-module` `ui-component`

See `docs/graph/hypergraph-clusters.md` § Cluster 66 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "evidence", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server evidence", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/evidence/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
