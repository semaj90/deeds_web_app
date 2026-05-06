# AGENTS.md — `src/lib/server/evidence/services`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory: src/lib/server/evidence/services

## Snapshot

- 5 file(s), 0 handler(s)
- Audit score: **99/100**
- no audit signals


## Files (5)

- `drizzle-stub.ts`
- `embedding.ts`
- `entity-extractor.ts`
- `forensics.ts`
- `ocr.ts`

## Hypergraph cluster

This directory is part of cluster **C32** — function chunks in \`src/lib/server/services\` (tag: api-route)

- **Top kinds**: function×15, unknown×1
- **Top tags**: `api-route` `server-module` `redis` `vector` `schema`

See `docs/graph/hypergraph-clusters.md` § Cluster 32 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C32 — function chunks in `src/lib/server/services` (tag: api-route)
- **BoW texture key**: `texture:bow:cluster:32` (Redis 1h TTL)
- **Qdrant tags**: `api-route` `server-module` `redis` `vector` `schema`
- **Paired tests**: 1/5 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "services", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "evidence services", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/evidence/services/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 32 })` — BoW texture tile for cluster C32
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 32 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
