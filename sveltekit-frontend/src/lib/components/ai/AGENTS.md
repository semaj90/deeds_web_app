# AGENTS.md — `src/lib/components/ai`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

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

## Hypergraph cluster

This directory is part of cluster **C5** — component chunks in \`src/lib/components/ai\` (tag: ai)

- **Top kinds**: component×16
- **Top tags**: `ai` `auth` `page` `component` `embedding`

See `docs/graph/hypergraph-clusters.md` § Cluster 5 for full digest.

## Warnings

- ⚠️ 2 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "ai", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components ai", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/ai/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
