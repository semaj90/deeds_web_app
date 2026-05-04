# AGENTS.md — `src/lib/ai`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:03:00.655Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/ai

## Snapshot

- shared library directory with 13 files, 0 API handlers, 1 TODOs, 1 SSR-unsafe
- Audit score: **68/100** ⚠️
- 🔴 SSR-unsafe: 1 · 🟠 hardcoded localhost: 2
- Tags: `src` `lib` `ai` `zod` `ssr-unsafe` `has-todo`

## Files (13)

- `base64-fp32-quantizer.ts`
- `citation-cache.ts`
- `client-cache.ts`
- `client-embed.ts`
- `client-llm-synthesis.ts`
- `client-quality.ts`
- `client-router.ts`
- `emotion-context.ts`

## Warnings

- ⚠️ 1 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
