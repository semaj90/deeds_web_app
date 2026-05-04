# AGENTS.md — `src/lib/server/ml`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:03:00.655Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/ml

## Snapshot

- server module directory with 8 files, 0 API handlers, 3 Drizzle refs
- Audit score: **95/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `server` `db-schema`

## Files (8)

- `feedback-store.ts`
- `multi-modal-ranker.ts`
- `recommendation-glyph.ts`
- `recommendation-metrics.ts`
- `som-cluster.ts`
- `topic-cluster.ts`
- `topic-clustering-worker.ts`
- `user-history.ts`

## Warnings

- ⚠️ Hardcoded localhost refs

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
