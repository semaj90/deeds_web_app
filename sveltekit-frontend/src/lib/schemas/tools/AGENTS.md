# AGENTS.md — `src/lib/schemas/tools`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/schemas/tools

## Snapshot

- shared library directory with 8 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `json` `src` `lib` `schemas`

## Files (8)

- `chunk-embed.schema.json`
- `cluster-tag.schema.json`
- `crawl-docs.schema.json`
- `kb-search.schema.json`
- `langextract-batch.schema.json`
- `llm-log.schema.json`
- `scan-repo.schema.json`
- `source-validation.schema.json`

## Hypergraph cluster

This directory is part of cluster **C32** — function chunks in \`src/lib/server/services\` (tag: api-route)

- **Top kinds**: function×15, unknown×1
- **Top tags**: `api-route` `server-module` `redis` `vector` `schema`

See `docs/graph/hypergraph-clusters.md` § Cluster 32 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "tools", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "schemas tools", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/schemas/tools/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
