# AGENTS.md — `src/lib/server`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server

## Snapshot

- server module directory with 57 files, 3 API handlers, 142 Drizzle refs
- Audit score: **100/100**
- 🟠 hardcoded localhost: 5
- Tags: `src` `lib` `server` `zod` `db-schema` `auth`

## Files (57)

- `ace-ingest-progress.ts`
- `api-metadata-extractor.ts`
- `api-registry.ts`
- `api-response.ts`
- `auth-guard.js`
- `auth-helpers.ts`
- `auth.ts`
- `batch-embedder.ts`

## Hypergraph cluster

This directory is part of cluster **C90** — function chunks in \`src/lib/server\` (tag: auth)

- **Top kinds**: function×9, route-handler×4, const×1
- **Top tags**: `auth` `api` `server`

See `docs/graph/hypergraph-clusters.md` § Cluster 90 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "server", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib server", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
