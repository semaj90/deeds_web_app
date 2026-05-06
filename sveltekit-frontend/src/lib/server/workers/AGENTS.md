# AGENTS.md — `src/lib/server/workers`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/workers

## Snapshot

- server module directory with 5 files, 0 API handlers, 3 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `db-schema` `zod`

## Files (5)

- `src/lib/server/workers/audio-processor.ts`
- `src/lib/server/workers/audio-queue-consumer.ts`
- `src/lib/server/workers/compute-pool.ts`
- `src/lib/server/workers/document-embed-consumer.ts`
- `src/lib/server/workers/video-vlm-processor.ts`

## Hypergraph cluster

This directory is part of cluster **C24** — class chunks in \`src/lib/server/workers\` (tag: redis)

- **Top kinds**: class×2, function×1
- **Top tags**: `redis` `vector` `embedding` `rabbitmq` `worker`

See `docs/graph/hypergraph-clusters.md` § Cluster 24 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C24 — class chunks in `src/lib/server/workers` (tag: redis)
- **BoW texture key**: `texture:bow:cluster:24` (Redis 1h TTL)
- **Qdrant tags**: `redis` `vector` `embedding` `rabbitmq` `worker`
- **Paired tests**: 0/5 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "workers", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server workers", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/workers/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 24 })` — BoW texture tile for cluster C24
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 24 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
