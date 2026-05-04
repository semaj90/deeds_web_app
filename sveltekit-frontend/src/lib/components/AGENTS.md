# AGENTS.md — `src/lib/components`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:03:00.655Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components

## Snapshot

- shared library directory with 56 files, 0 API handlers, 1 Drizzle refs, 6 TODOs, 18 SSR-unsafe
- Audit score: **70/100**
- 🔴 SSR-unsafe: 2 · 🟠 hardcoded localhost: 2 · TODOs: 2
- Tags: `src` `lib` `components` `component` `zod` `ssr-unsafe`

## Files (56)

- `ActionPopup.svelte`
- `AIChatAssistant.svelte`
- `APITesterModal.svelte`
- `ArchivedRoutesPanel.svelte`
- `CanvasEditor.svelte`
- `CaseOutcomePrediction.svelte`
- `CaseSelector.svelte`
- `ChatContextPanel.svelte`

## Warnings

- ⚠️ 18 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
