# AGENTS.md — `src/lib/stores`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/stores

## Snapshot

- shared library directory with 14 files, 0 API handlers, 1 SSR-unsafe
- Audit score: **80/100**
- no audit signals
- Tags: `src` `lib` `stores` `zod` `ssr-unsafe`

## Files (14)

- `analysis-panel.svelte.ts`
- `analytics.svelte.ts`
- `app-store.svelte.ts`
- `appState.svelte.ts`
- `auth-store.svelte.ts`
- `evidenceCommandCenter.store.svelte.ts`
- `index.ts`
- `knowledge-search.svelte.ts`

## Hypergraph cluster

This directory is part of cluster **C52** — const chunks in \`src/lib/stores/unified\` (tag: server-module)

- **Top kinds**: const×16
- **Top tags**: `server-module` `cache` `config` `embedding` `auth`

See `docs/graph/hypergraph-clusters.md` § Cluster 52 for full digest.

## Warnings

- ⚠️ 1 SSR-unsafe globals

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "stores", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib stores", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/stores/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
