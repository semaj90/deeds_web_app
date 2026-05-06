# AGENTS.md — `src/lib/components/legal-ai`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/legal-ai

## Snapshot

- shared library directory with 18 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `components` `component`

## Files (18)

- `src/lib/components/legal-ai/AttachToCaseModal.svelte`
- `src/lib/components/legal-ai/CaseChatPanel.svelte`
- `src/lib/components/legal-ai/CaseDocumentWriter.svelte`
- `src/lib/components/legal-ai/CaseStatuteLinks.svelte`
- `src/lib/components/legal-ai/CitationCollections.svelte`

## Hypergraph cluster

This directory is part of cluster **C35** — component chunks in \`src/lib/components/legal-ai\` (tag: component)

- **Top kinds**: component×16
- **Top tags**: `component` `page` `vector` `layout`

See `docs/graph/hypergraph-clusters.md` § Cluster 35 for full digest.


## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C35 — component chunks in `src/lib/components/legal-ai` (tag: component)
- **BoW texture key**: `texture:bow:cluster:35` (Redis 1h TTL)
- **Qdrant tags**: `component` `page` `vector` `layout`
- **Paired tests**: 0/18 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "legal-ai", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components legal-ai", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/legal-ai/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 35 })` — BoW texture tile for cluster C35
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 35 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
