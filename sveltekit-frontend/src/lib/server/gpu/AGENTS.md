# AGENTS.md — `src/lib/server/gpu`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/gpu

## Snapshot

- server module directory with 9 files, 0 API handlers, 2 Drizzle refs
- Audit score: **95/100**
- 🟠 hardcoded localhost: 2
- Tags: `src` `lib` `server` `db-schema` `zod` `mjs`

## Files (9)

- `background-analyzer.ts`
- `cuda-bridge.ts`
- `gpu-monitor.ts`
- `libtorch-bridge.ts`
- `mapreduce-cuda-analyzer.ts`
- `mapreduce-runner.mjs`
- `mapreduce-worker.mjs`
- `pytorch-graph.ts`

## Hypergraph cluster

This directory is part of cluster **C20** — function chunks in \`src/lib/webgpu\` (tag: embedding)

- **Top kinds**: function×9, class×5, const×1
- **Top tags**: `embedding` `redis` `vector` `auth` `schema`

See `docs/graph/hypergraph-clusters.md` § Cluster 20 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "gpu", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server gpu", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/gpu/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
