# AGENTS.md — `src/lib/server/legal`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/legal

## Snapshot

- server module directory with 7 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `server`

## Files (7)

- `src/lib/server/legal/constitution-fetcher.ts`
- `src/lib/server/legal/constitution-pipeline.ts`
- `src/lib/server/legal/constitution-registry.ts`
- `src/lib/server/legal/constitution-tagger.ts`
- `src/lib/server/legal/html-normalizer.ts`

## Hypergraph cluster

This directory is part of cluster **C47** — route-handler chunks in \`src/lib/server/legal\` (tag: api)

- **Top kinds**: route-handler×6, const×5, function×4
- **Top tags**: `api` `server` `page-server` `ssr` `api-route`

See `docs/graph/hypergraph-clusters.md` § Cluster 47 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C47 — route-handler chunks in `src/lib/server/legal` (tag: api)
- **BoW texture key**: `texture:bow:cluster:47` (Redis 1h TTL)
- **Qdrant tags**: `api` `server` `page-server` `ssr` `api-route`
- **Paired tests**: 0/7 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "legal", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server legal", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/legal/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 47 })` — BoW texture tile for cluster C47
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 47 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
