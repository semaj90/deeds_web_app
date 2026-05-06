# AGENTS.md — `src/lib/components/ui/gaming/types`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory: src/lib/components/ui/gaming/types

## Snapshot

- 2 file(s), 0 handler(s)
- Audit score: **99/100**
- no audit signals


## Files (2)

- `gaming-types-minimal.ts`
- `gaming-types.ts`

## Hypergraph cluster

This directory is part of cluster **C30** — type chunks in \`src/lib/components/ui/gaming/types\`

- **Top kinds**: type×2


See `docs/graph/hypergraph-clusters.md` § Cluster 30 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C30 — type chunks in `src/lib/components/ui/gaming/types`
- **BoW texture key**: `texture:bow:cluster:30` (Redis 1h TTL)
- **Qdrant tags**: _(none)_
- **Paired tests**: 0/2 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "types", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "gaming types", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/ui/gaming/types/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 30 })` — BoW texture tile for cluster C30
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 30 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
