# AGENTS.md — `src/routes/login`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/login

## Snapshot

- route handler directory with 3 files, 0 API handlers, 1 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `routes` `login` `route` `db-schema` `auth`

## Files (3)

- `+page.server.ts`
- `+page.svelte`
- `schema.ts`

## Hypergraph cluster

This directory is part of cluster **C83** — const chunks in \`src/routes/(app)/admin/dev-tools\` (tag: page-server)

- **Top kinds**: const×14, component×1, type×1
- **Top tags**: `page-server` `ssr` `embedding` `vector` `redis`

See `docs/graph/hypergraph-clusters.md` § Cluster 83 for full digest.

## Warnings

- ⚠️ 1 routes lack test pairing

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "login", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "routes login", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/login/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
