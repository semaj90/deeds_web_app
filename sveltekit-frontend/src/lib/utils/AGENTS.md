# AGENTS.md — `src/lib/utils`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:03:00.655Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/utils

## Snapshot

- shared library directory with 42 files, 0 API handlers, 2 SSR-unsafe
- Audit score: **75/100**
- 🔴 SSR-unsafe: 2 · 🟠 hardcoded localhost: 4
- Tags: `src` `lib` `utils` `zod` `ssr-unsafe` `auth`

## Files (42)

- `accessibility-validator.ts`
- `accessibility.ts`
- `accessibleClick.ts`
- `api-endpoints.ts`
- `bits-ui-adapter.ts`
- `buffer-conversion.ts`
- `case-logic.ts`
- `cn.ts`

## Warnings

- ⚠️ 2 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
