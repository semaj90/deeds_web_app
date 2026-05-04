# AGENTS.md — `src/lib/components/ai`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:03:00.655Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/ai

## Snapshot

- shared library directory with 46 files, 0 API handlers, 2 SSR-unsafe
- Audit score: **75/100**
- 🔴 SSR-unsafe: 2 · 🟠 hardcoded localhost: 2
- Tags: `src` `lib` `components` `component` `zod` `ssr-unsafe`

## Files (45)

- `ACEContextBubble.svelte`
- `AIAssistantButton.svelte`
- `AIAssistantPanel.svelte`
- `AIButton.svelte`
- `AIChatWidget.svelte`
- `AIRecommendation.svelte`
- `AIStatusIndicator.svelte`
- `AskAI.svelte`

## Warnings

- ⚠️ 2 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
