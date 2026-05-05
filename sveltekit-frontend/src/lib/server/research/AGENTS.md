# AGENTS.md — `src/lib/server/research`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/research

## Snapshot

- server module directory with 13 files, 0 API handlers, 1 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `zod` `db-schema`

## Files (13)

- `chunk-web-doc.ts`
- `fastcrawl.ts`
- `github-harvester.ts`
- `github-mcp.ts`
- `github-search.ts`
- `lane4-feedback.ts`
- `normalize-html.ts`
- `reddit-harvester.ts`

## Hypergraph cluster

This directory is part of cluster **C43** — type chunks in \`src/lib/services/knowledge-search\` (tag: embedding)

- **Top kinds**: type×13, const×3
- **Top tags**: `embedding` `vector` `api-route` `types` `server-module`

See `docs/graph/hypergraph-clusters.md` § Cluster 43 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "research", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server research", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/research/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
