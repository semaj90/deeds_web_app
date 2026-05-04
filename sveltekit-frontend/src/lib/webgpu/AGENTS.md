# AGENTS.md — `src/lib/webgpu`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/webgpu

## Snapshot

- shared library directory with 19 files, 0 API handlers, 2 SSR-unsafe
- Audit score: **75/100**
- 🔴 SSR-unsafe: 2 · 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `webgpu` `ssr-unsafe`

## Files (19)

- `compute-shader-engine.ts`
- `dimensional-tensor-store.ts`
- `gaussian-splat-renderer.ts`
- `init.ts`
- `legal-compute-shaders.ts`
- `legal-document-graph.ts`
- `N64TextureLODSystem.ts`
- `shader-cache-manager.ts`

## Hypergraph cluster

This directory is part of cluster **C23** — class chunks in \`src/lib/webgpu\` (tag: embedding)

- **Top kinds**: class×6, function×6, type×2
- **Top tags**: `embedding` `api-route` `sse` `types` `server-module`

See `docs/graph/hypergraph-clusters.md` § Cluster 23 for full digest.

## Warnings

- ⚠️ 2 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "webgpu", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib webgpu", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/webgpu/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
