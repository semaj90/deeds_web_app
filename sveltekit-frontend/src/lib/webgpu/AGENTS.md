# AGENTS.md — `src/lib/webgpu`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/webgpu

## Snapshot

- shared library directory with 19 files, 0 API handlers
- Audit score: **85/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `webgpu`

## Files (19)

- `src/lib/webgpu/compute-shader-engine.ts`
- `src/lib/webgpu/dimensional-tensor-store.ts`
- `src/lib/webgpu/gaussian-splat-renderer.ts`
- `src/lib/webgpu/init.ts`
- `src/lib/webgpu/legal-compute-shaders.ts`

## Hypergraph cluster

This directory is part of cluster **C23** — class chunks in \`src/lib/webgpu\` (tag: embedding)

- **Top kinds**: class×6, function×6, type×2
- **Top tags**: `embedding` `api-route` `sse` `types` `server-module`

See `docs/graph/hypergraph-clusters.md` § Cluster 23 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C23 — class chunks in `src/lib/webgpu` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:23` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `api-route` `sse` `types` `server-module`
- **Paired tests**: 0/19 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "webgpu", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib webgpu", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/webgpu/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 23 })` — BoW texture tile for cluster C23
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 23 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
