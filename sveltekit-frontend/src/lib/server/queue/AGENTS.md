# AGENTS.md — `src/lib/server/queue`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/queue

## Snapshot

- server module directory with 8 files, 0 API handlers, 1 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `zod` `db-schema`

## Files (8)

- `dispatch-inline.ts`
- `job-types.ts`
- `queue-worker.ts`
- `rabbitmq-client.ts`
- `rabbitmq-connection.ts`
- `rabbitmq-manager-fixed.ts`
- `rabbitmq-xstate-integration.ts`
- `workflow-publish.ts`

## Hypergraph cluster

This directory is part of cluster **C96** — type chunks in \`src/lib/server\` (tag: embedding)

- **Top kinds**: type×12, const×2, function×2
- **Top tags**: `embedding` `redis` `vector` `types` `rabbitmq`

See `docs/graph/hypergraph-clusters.md` § Cluster 96 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "queue", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server queue", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/queue/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
