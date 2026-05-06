# AGENTS.md — `src/lib/components/evidence`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/evidence

## Snapshot

- shared library directory with 41 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `components` `component` `zod`

## Files (41)

- `src/lib/components/evidence/board-history.svelte.ts`
- `src/lib/components/evidence/board-persistence.svelte.ts`
- `src/lib/components/evidence/BoardMinimap.svelte`
- `src/lib/components/evidence/BoardSearchOverlay.svelte`
- `src/lib/components/evidence/CaseEvidenceOrganizer.svelte`

## Hypergraph cluster

This directory is part of cluster **C86** — function chunks in \`src/lib/components/evidence\` (tag: embedding)

- **Top kinds**: function×14, const×2
- **Top tags**: `embedding` `server-module` `vector` `page-component` `redis`

See `docs/graph/hypergraph-clusters.md` § Cluster 86 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C86 — function chunks in `src/lib/components/evidence` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:86` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `server-module` `vector` `page-component` `redis`
- **Paired tests**: 0/41 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "evidence", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components evidence", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/evidence/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 86 })` — BoW texture tile for cluster C86
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 86 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
