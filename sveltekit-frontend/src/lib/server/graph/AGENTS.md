# AGENTS.md — `src/lib/server/graph`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/graph

## Snapshot

- server module directory with 17 files, 0 API handlers, 2 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `zod` `auth` `db-schema`

## Files (17)

- `codebase-cluster-detection.ts`
- `codebase-neo4j-sync.ts`
- `codebase-scanner-v2.ts`
- `codebase-scanner.ts`
- `community-graph.ts`
- `couchdb-pagerank.ts`
- `evidence-graph-service.ts`
- `gpu-graph-analysis.ts`

## Hypergraph cluster

This directory is part of cluster **C73** — function chunks in \`src/lib/server/retrieval\` (tag: vector)

- **Top kinds**: function×14, class×1, type×1
- **Top tags**: `vector` `redis` `embedding` `rag-pipeline` `graph-db`

See `docs/graph/hypergraph-clusters.md` § Cluster 73 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "graph", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server graph", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/graph/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
