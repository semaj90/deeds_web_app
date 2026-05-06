# AGENTS.md — `src/lib/server/analysis`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/analysis

## Snapshot

- server module directory with 12 files, 0 API handlers, 2 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `db-schema` `zod`

## Files (12)

- `src/lib/server/analysis/analysis-jobs.ts`
- `src/lib/server/analysis/batch-error-analysis.ts`
- `src/lib/server/analysis/concurrency-gate.ts`
- `src/lib/server/analysis/entity-extraction.ts`
- `src/lib/server/analysis/evidence-analysis-pipeline.ts`

## Hypergraph cluster

This directory is part of cluster **C54** — function chunks in \`src/lib/server/analysis\`

- **Top kinds**: function×7


See `docs/graph/hypergraph-clusters.md` § Cluster 54 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C54 — function chunks in `src/lib/server/analysis`
- **BoW texture key**: `texture:bow:cluster:54` (Redis 1h TTL)
- **Qdrant tags**: _(none)_
- **Paired tests**: 0/12 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "analysis", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server analysis", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/analysis/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 54 })` — BoW texture tile for cluster C54
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 54 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
