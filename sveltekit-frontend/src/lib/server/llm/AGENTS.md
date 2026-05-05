# AGENTS.md — `src/lib/server/llm`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/llm

## Snapshot

- server module directory with 6 files, 0 API handlers, 1 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `db-schema` `zod`

## Files (6)

- `contextual-chat.ts`
- `gemma4-tool-loop.ts`
- `gemmaIntake.ts`
- `gemmaReports.ts`
- `ollama-client.ts`
- `ollamaClient.ts`

## Hypergraph cluster

This directory is part of cluster **C44** — route-handler chunks in \`src/lib/server/llm\` (tag: api)

- **Top kinds**: route-handler×11, function×5
- **Top tags**: `api` `server` `embedding` `auth` `vector`

See `docs/graph/hypergraph-clusters.md` § Cluster 44 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "llm", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server llm", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/llm/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
