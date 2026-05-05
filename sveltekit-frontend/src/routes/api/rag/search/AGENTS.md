# AGENTS.md — `src/routes/api/rag/search`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/api/rag/search

## Snapshot

- src/routes/api/rag/search/+server.ts, src/routes/api/rag/search/server.route.test.ts
- Audit score: **80/100**
- Auth: 1/1 · Zod: 1/1 · tests paired: 1/1
- Tags: `search`

## Files (2)

- `+server.ts`
- `server.route.test.ts`


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "search", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "rag search", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/api/rag/search/<file>" })` — fetch any file's contents (sandboxed to src/)

For route handlers in this dir, also try:
- `verify_fix({ filePath: "src/routes/api/rag/search/+server.ts" })` — runs svelte-check / tsc on a single file

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
