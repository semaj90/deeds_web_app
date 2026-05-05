# AGENTS.md — `src/lib/server/db/schema`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/db/schema

## Snapshot

- src/lib/server/db/schema/ace-web-crawl.ts, src/lib/server/db/schema/ai_chat.ts, src/lib/server/db/schema/analytics.ts, src/lib/server/db/schema/case-library-links.ts, src/lib/server/db/schema/citations.ts
- Audit score: **50/100** ⚠️
- no audit signals
- Tags: `schema`

## Files (33)

- `ace-web-crawl.ts`
- `ai_chat.ts`
- `analytics.ts`
- `case-library-links.ts`
- `citations.ts`
- `codebase-intelligence.ts`
- `errorBrainDiffs.ts`
- `error_brain_analysis.ts`

## Hypergraph cluster

This directory is part of cluster **C95** — type chunks in \`src/lib/server/db/schema\` (tag: database)

- **Top kinds**: type×16
- **Top tags**: `database` `schema` `drizzle` `auth` `embedding`

See `docs/graph/hypergraph-clusters.md` § Cluster 95 for full digest.

## Topological neighbors

- `55`
- `16`

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "schema", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "db schema", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/db/schema/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
