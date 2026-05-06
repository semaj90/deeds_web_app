# AGENTS.md — `src/lib/machines`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/machines

## Snapshot

- shared library directory with 11 files, 0 API handlers
- Audit score: **85/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `machines` `component` `zod`

## Files (11)

- `src/lib/machines/AIAssistantMachineComponent.svelte`
- `src/lib/machines/audio-upload-machine.ts`
- `src/lib/machines/auth-machine.ts`
- `src/lib/machines/document-upload-machine.ts`
- `src/lib/machines/evidence-analysis-machine.ts`

## Hypergraph cluster

This directory is part of cluster **C96** — type chunks in \`src/lib/server\` (tag: embedding)

- **Top kinds**: type×12, const×2, function×2
- **Top tags**: `embedding` `redis` `vector` `types` `rabbitmq`

See `docs/graph/hypergraph-clusters.md` § Cluster 96 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C96 — type chunks in `src/lib/server` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:96` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `redis` `vector` `types` `rabbitmq`
- **Paired tests**: 1/11 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "machines", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib machines", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/machines/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 96 })` — BoW texture tile for cluster C96
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 96 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
