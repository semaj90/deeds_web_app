# AGENTS.md — `src/routes/(app)/evidence/upload`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/(app)/evidence/upload

## Snapshot

- src/routes/(app)/evidence/upload/+page.server.ts, src/routes/(app)/evidence/upload/+page.svelte
- Audit score: **60/100** ⚠️
- 🔴 SSR-unsafe: 1
- Tags: `upload`

## Files (2)

- `+page.server.ts`
- `+page.svelte`

## Hypergraph cluster

This directory is part of cluster **C92** — component chunks in \`src/lib/components/evidence\` (tag: embedding)

- **Top kinds**: component×14, const×1, function×1
- **Top tags**: `embedding` `page` `component` `xstate`

See `docs/graph/hypergraph-clusters.md` § Cluster 92 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "upload", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "evidence upload", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/evidence/upload/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
