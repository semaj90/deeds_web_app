# AGENTS.md — `src/lib/services/error-analysis`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:03:00.655Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/services/error-analysis

## Snapshot

- shared library directory with 17 files, 0 API handlers
- Audit score: **85/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `services` `zod`

## Files (17)

- `CacheService.ts`
- `DecisionEngine.ts`
- `ErrorClustering.ts`
- `EscalationService.ts`
- `ExperienceRecorder.ts`
- `FixSynthesizer.ts`
- `GRPOPolicy.ts`
- `index.ts`

## Warnings

- ⚠️ Hardcoded localhost refs

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
