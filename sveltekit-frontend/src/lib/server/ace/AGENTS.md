# AGENTS.md — `src/lib/server/ace`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/ace

## Snapshot

- server module directory with 17 files, 0 API handlers, 3 Drizzle refs
- Audit score: **95/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `server` `zod` `db-schema`

## Files (17)

- `ace-agent.ts`
- `ace-error-kag.ts`
- `ace-wiki.ts`
- `auto-tagger.ts`
- `chat-memory.ts`
- `codeintel-datastore.ts`
- `context-assembler.ts`
- `error-kag-writer.ts`

## Hypergraph cluster

This directory is part of cluster **C72** — function chunks in \`src/lib/server/ace\` (tag: vector)

- **Top kinds**: function×14, route-handler×1, const×1
- **Top tags**: `vector` `embedding` `redis` `auth` `ai`

See `docs/graph/hypergraph-clusters.md` § Cluster 72 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "ace", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server ace", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/ace/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
