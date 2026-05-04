# AGENTS.md — `src/lib/server/error-brain/transport`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/error-brain/transport

## Snapshot

- src/lib/server/error-brain/transport/factory.ts, src/lib/server/error-brain/transport/interface.ts, src/lib/server/error-brain/transport/mux.ts, src/lib/server/error-brain/transport/none.ts, src/lib/server/error-brain/transport/redis.ts
- Audit score: **20/100** ⚠️
- no audit signals
- Tags: `transport` `low-score` `has-errors`

## Files (6)

- `factory.ts`
- `interface.ts`
- `mux.ts`
- `none.ts`
- `redis.ts`
- `sse.ts`

## Warnings

- ⚠️ Score 20 below threshold

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "transport", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "error-brain transport", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/error-brain/transport/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
