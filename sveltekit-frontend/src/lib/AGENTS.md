# AGENTS.md — `src/lib`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:03:00.655Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib

## Snapshot

- module directory with 11 files, 3 API handlers, 160 Drizzle refs, 9 TODOs, 29 SSR-unsafe
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `ai` `zod` `ssr-unsafe` `has-todo`

## Files (11)

- `ambient-events.d.ts`
- `client-logging.ts`
- `command-center-manifest.ts`
- `env.server.ts`
- `index.ts`
- `polyfills.ts`
- `schemas.ts`
- `stores.svelte.ts`

## Warnings

- ⚠️ 29 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
