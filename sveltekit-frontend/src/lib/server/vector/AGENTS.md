# AGENTS.md — `src/lib/server/vector`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/vector

## Snapshot

- server module directory with 10 files, 0 API handlers, 1 Drizzle refs
- Audit score: **95/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `server` `zod` `db-schema`

## Files (10)

- `bm42-sparse.ts`
- `embedding-gemma.ts`
- `metadata-encoder.ts`
- `multi-store.ts`
- `pgvector.ts`
- `PgVectorService.ts`
- `qdrant-api-wrapper.ts`
- `qdrant-health.ts`

## Hypergraph cluster

This directory is part of cluster **C18** — type chunks in \`src/lib/types\` (tag: embedding)

- **Top kinds**: type×16
- **Top tags**: `embedding` `types` `auth` `api-route` `analytics`

See `docs/graph/hypergraph-clusters.md` § Cluster 18 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "vector", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server vector", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/vector/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
