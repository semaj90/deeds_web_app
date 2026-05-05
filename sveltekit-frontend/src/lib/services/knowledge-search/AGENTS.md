# AGENTS.md — `src/lib/services/knowledge-search`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/services/knowledge-search

## Snapshot

- shared library directory with 11 files, 0 API handlers, 1 Drizzle refs, 1 SSR-unsafe
- Audit score: **85/100**
- 🔴 SSR-unsafe: 1 · 🟠 hardcoded localhost: 2
- Tags: `src` `lib` `services` `db-schema` `ssr-unsafe` `zod`

## Files (11)

- `ACPToolRegistry.ts`
- `index.ts`
- `KnowledgeIndexer.ts`
- `KnowledgeSearcher.ts`
- `MinioKnowledgeStore.ts`
- `PostgresKnowledgeStore.ts`
- `QdrantKnowledgeStore.ts`
- `RedisCacheService.ts`

## Hypergraph cluster

This directory is part of cluster **C17** — function chunks in \`src/lib/services/error-analysis\` (tag: embedding)

- **Top kinds**: function×15
- **Top tags**: `embedding` `server-module` `cache` `vector` `redis`

See `docs/graph/hypergraph-clusters.md` § Cluster 17 for full digest.

## Warnings

- ⚠️ 1 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "knowledge-search", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "services knowledge-search", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/services/knowledge-search/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
