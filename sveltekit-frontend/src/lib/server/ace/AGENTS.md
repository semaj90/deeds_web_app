# AGENTS.md — `src/lib/server/ace`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:03:00.655Z · agents.md spec · regen: npm run agents:write -->

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

## Warnings

- ⚠️ Hardcoded localhost refs

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
