# AGENTS.md — `src/routes`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:03:00.655Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes

## Snapshot

- module directory with 6 files, 580 API handlers, 242 Drizzle refs, 7 TODOs, 15 SSR-unsafe
- Audit score: **84/100**
- 🔴 SSR-unsafe: 1
- Tags: `src` `routes` `(admin)` `component` `auth` `ssr-unsafe`

## Files (6)

- `+error.svelte`
- `+layout.server.ts`
- `+layout.svelte`
- `+layout.ts`
- `+page.server.ts`
- `+page.svelte`

## Warnings

- ⚠️ 15 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs
- ⚠️ 615 routes lack test pairing

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
