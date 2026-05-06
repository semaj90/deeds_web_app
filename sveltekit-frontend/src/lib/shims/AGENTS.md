# AGENTS.md — `src/lib/shims`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T16:15:22.211Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/shims

## Snapshot

- shared library directory with 11 files, 0 API handlers, 1 Drizzle refs, 1 SSR-unsafe
- Audit score: **90/100**
- 🔴 SSR-unsafe: 1
- Tags: `src` `lib` `shims` `db-schema` `zod` `ssr-unsafe`

## Files (11)

- `src/lib/shims/commonjs-shim.js`
- `src/lib/shims/dns-browser-shim.js`
- `src/lib/shims/drizzle-node-postgres.ts`
- `src/lib/shims/fs-browser-shim.js`
- `src/lib/shims/ioredis-browser-shim.js`

## Hypergraph cluster

This directory is part of cluster **C57** — const chunks in \`src/lib/shims\` (tag: embedding)

- **Top kinds**: const×10, function×3, type×2
- **Top tags**: `embedding` `vector` `auth` `server-module` `config`

See `docs/graph/hypergraph-clusters.md` § Cluster 57 for full digest.

## Warnings

- ⚠️ 1 SSR-unsafe globals

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: C57 — const chunks in `src/lib/shims` (tag: embedding)
- **BoW texture key**: `texture:bow:cluster:57` (Redis 1h TTL)
- **Qdrant tags**: `embedding` `vector` `auth` `server-module` `config`
- **Paired tests**: 0/11 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "shims", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib shims", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/shims/<file>" })` — fetch any file's contents (sandboxed to src/)
- `cluster_bag_lookup({ clusterId: 57 })` — BoW texture tile for cluster C57
- `rag_search({ query: "…", collection: "codebase_chunks_768", filter: { gpuCluster: 57 } })` — semantic search scoped to this cluster

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
