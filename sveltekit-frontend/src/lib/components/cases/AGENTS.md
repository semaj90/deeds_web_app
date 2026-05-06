# AGENTS.md — `src/lib/components/cases`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/cases

## Snapshot

- shared library directory with 11 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `components` `component` `zod`

## Files (11)

- `src/lib/components/cases/CaseCard.svelte`
- `src/lib/components/cases/CaseFilters.svelte`
- `src/lib/components/cases/CaseNotesEditor.svelte`
- `src/lib/components/cases/CaseOverview.svelte`
- `src/lib/components/cases/CaseOverviewModal.svelte`

## Hypergraph cluster

This directory is part of cluster **C18** — type chunks in \`src/lib/types\` (tag: embedding)

- **Top kinds**: type×16
- **Top tags**: `embedding` `types` `auth` `api-route` `analytics`

See `docs/graph/hypergraph-clusters.md` § Cluster 18 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C18 — type chunks in `src/lib/types` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:18` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `types` `auth` `api-route` `analytics`
- **Paired tests**: 1/11 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "cases", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components cases", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/cases/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 18 })` — BoW texture tile for cluster C18
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 18 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
