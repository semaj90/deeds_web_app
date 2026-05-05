# AGENTS.md — `src/lib/server/indexer`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/indexer

## Snapshot

- server module directory with 11 files, 1 API handlers, 4 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `api-handler` `db-schema` `zod`

## Files (11)

- `ast-chunker.ts`
- `ast-ingest-logger.ts`
- `cluster-summary.ts`
- `directory-summarizer.ts`
- `dual-embedder.ts`
- `gpu-karpathy-tagger.ts`
- `karpathy-wiki.ts`
- `legal-chunker.ts`

## Hypergraph cluster

This directory is part of cluster **C58** — type chunks in \`src/lib/server/indexer\` (tag: vector)

- **Top kinds**: type×9
- **Top tags**: `vector` `embedding` `xstate` `auth` `schema`

See `docs/graph/hypergraph-clusters.md` § Cluster 58 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "indexer", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server indexer", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/indexer/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
