# AGENTS.md — `src`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src

## Snapshot

- src/ambient-legacy.d.ts, src/app.d.ts, src/auth-store.svelte.ts, src/custom-modules.d.ts, src/env.d.ts
- Audit score: **50/100** ⚠️
- 🟠 hardcoded localhost: 1
- Tags: `src`

## Files (17)

- `ambient-legacy.d.ts`
- `app.d.ts`
- `auth-store.svelte.ts`
- `custom-modules.d.ts`
- `env.d.ts`
- `global.d.ts`
- `hooks.client.ts`
- `hooks.server.ts`

## Topological neighbors

- `7`
- `9`
- `86`
- `3`
- `4`

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "src", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "src", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
