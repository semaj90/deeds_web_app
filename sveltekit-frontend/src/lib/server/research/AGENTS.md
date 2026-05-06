# AGENTS.md — `src/lib/server/research`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/research

## Snapshot

- server module directory with 16 files, 0 API handlers, 1 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `zod` `db-schema`

## Files (16)

- `src/lib/server/research/chunk-web-doc.ts`
- `src/lib/server/research/fastcrawl.ts`
- `src/lib/server/research/github-harvester.ts`
- `src/lib/server/research/github-mcp.ts`
- `src/lib/server/research/github-search.ts`

## Hypergraph cluster

This directory is part of cluster **C43** — type chunks in \`src/lib/services/knowledge-search\` (tag: embedding)

- **Top kinds**: type×13, const×3
- **Top tags**: `embedding` `vector` `api-route` `types` `server-module`

See `docs/graph/hypergraph-clusters.md` § Cluster 43 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C43 — type chunks in `src/lib/services/knowledge-search` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:43` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `vector` `api-route` `types` `server-module`
- **Paired tests**: 1/16 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "research", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server research", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/research/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 43 })` — BoW texture tile for cluster C43
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 43 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
