# AGENTS.md — `src/routes/(app)/cases/[id]/ai`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/(app)/cases/[id]/ai

## Snapshot

- src/routes/(app)/cases/[id]/ai/+page.server.ts, src/routes/(app)/cases/[id]/ai/+page.svelte
- Audit score: **60/100** ⚠️
- no audit signals
- Tags: `ai`

## Files (7)

- `+page.server.ts`
- `+page.svelte`
- `+page.server.ts`
- `+page.server.ts`
- `+page.server.ts`
- `+page.server.ts`
- `+page.server.ts`

## Hypergraph cluster

This directory is part of cluster **C83** — const chunks in \`src/routes/(app)/admin/dev-tools\` (tag: page-server)

- **Top kinds**: const×14, component×1, type×1
- **Top tags**: `page-server` `ssr` `embedding` `vector` `redis`

See `docs/graph/hypergraph-clusters.md` § Cluster 83 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "ai", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "[id] ai", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/cases/[id]/ai/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
