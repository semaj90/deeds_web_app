# AGENTS.md — `src/lib/machines`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:03:00.655Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/machines

## Snapshot

- shared library directory with 12 files, 0 API handlers, 1 SSR-unsafe
- Audit score: **75/100**
- 🔴 SSR-unsafe: 1 · 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `machines` `component` `zod` `ssr-unsafe`

## Files (12)

- `AIAssistantMachineComponent.svelte`
- `audio-upload-machine.ts`
- `auth-machine.ts`
- `document-upload-machine.ts`
- `evidence-analysis-machine.ts`
- `evidence-lifecycle-machine.ts`
- `evidence-processing-machine.ts`
- `evidenceCustodyMachine.ts`

## Warnings

- ⚠️ 1 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
