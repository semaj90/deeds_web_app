# AGENTS.md — `src/lib/services/knowledge-search`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:03:00.655Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/services/knowledge-search

## Snapshot

- shared library directory with 11 files, 0 API handlers, 1 Drizzle refs
- Audit score: **95/100**
- 🟠 hardcoded localhost: 2
- Tags: `src` `lib` `services` `db-schema` `zod`

## Files (11)

- `ACPToolRegistry.ts`
- `index.ts`
- `KnowledgeIndexer.ts`
- `KnowledgeSearcher.ts`
- `MinioKnowledgeStore.ts`
- `PostgresKnowledgeStore.ts`
- `QdrantKnowledgeStore.ts`
- `RedisCacheService.ts`

## Warnings

- ⚠️ Hardcoded localhost refs

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
