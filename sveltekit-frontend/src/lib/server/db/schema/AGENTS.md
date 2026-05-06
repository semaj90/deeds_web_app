# AGENTS.md — `src/lib/server/db/schema`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory: src/lib/server/db/schema

## Snapshot

- 38 file(s), 0 handler(s)
- Audit score: _(no GPU audit)_
- no audit signals


## Files (38)

- `ace-web-crawl.ts`
- `ai_chat.ts`
- `analytics.ts`
- `case-library-links.ts`
- `citations.ts`
- `codebase-intelligence.ts`
- `directory-clusters.ts`
- `embedded-summaries.ts`

## Hypergraph cluster

This directory is part of cluster **C95** — type chunks in \`src/lib/server/db/schema\` (tag: database)

- **Top kinds**: type×16
- **Top tags**: `database` `schema` `drizzle` `auth` `embedding`

See `docs/graph/hypergraph-clusters.md` § Cluster 95 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C95 — type chunks in `src/lib/server/db/schema` (tag: database)
- **BoW texture key**: `texture:bow:cluster:95` (Redis 1h TTL)
- **Qdrant tags**: `database` `schema` `drizzle` `auth` `embedding`
- **Paired tests**: 7/38 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "schema", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "db schema", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/db/schema/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 95 })` — BoW texture tile for cluster C95
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 95 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
