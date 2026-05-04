# AGENTS.md — `src/lib/components/yorha`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/yorha

## Snapshot

- shared library directory with 68 files, 0 API handlers, 1 TODOs, 4 SSR-unsafe
- Audit score: **68/100** ⚠️
- 🔴 SSR-unsafe: 4 · 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `components` `component` `ssr-unsafe` `has-todo`

## Files (38)

- `CaseTheoryConstructor.svelte`
- `ContradictionReveal.svelte`
- `CrossExaminationAssistant.svelte`
- `DetectiveEvidenceMap.svelte`
- `EnhancedYoRHaAIAssistant.svelte`
- `EvidenceBoard.svelte`
- `JudicialAnalysisAgent.svelte`
- `PhoenixEventMonitor.svelte`

## Hypergraph cluster

This directory is part of cluster **C50** — component chunks in \`src/lib/components/ui/gaming/n64\` (tag: page)

- **Top kinds**: component×14, unknown×2
- **Top tags**: `page` `component`

See `docs/graph/hypergraph-clusters.md` § Cluster 50 for full digest.

## Warnings

- ⚠️ 4 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "yorha", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components yorha", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/yorha/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
