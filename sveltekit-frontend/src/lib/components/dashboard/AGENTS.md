# AGENTS.md — `src/lib/components/dashboard`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/dashboard

## Snapshot

- shared library directory with 15 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `components` `component`

## Files (15)

- `src/lib/components/dashboard/AchievementBadge.svelte`
- `src/lib/components/dashboard/CaseCardGrid.svelte`
- `src/lib/components/dashboard/DetectiveRankBadge.svelte`
- `src/lib/components/dashboard/DocumentThumbnailTray.svelte`
- `src/lib/components/dashboard/EvidenceAnalysisDashboard.svelte`

## Hypergraph cluster

This directory is part of cluster **C21** — component chunks in \`src/lib/components/legal\` (tag: auth)

- **Top kinds**: component×6, function×5, route-handler×2
- **Top tags**: `auth` `embedding` `redis` `ai` `api`

See `docs/graph/hypergraph-clusters.md` § Cluster 21 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C21 — component chunks in `src/lib/components/legal` (tag: auth)
- **BoW texture key**: `texture:bow:cluster:21` (Redis 1h TTL)
- **Qdrant tags**: `auth` `embedding` `redis` `ai` `api`
- **Paired tests**: 1/15 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "dashboard", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components dashboard", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/dashboard/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 21 })` — BoW texture tile for cluster C21
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 21 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
