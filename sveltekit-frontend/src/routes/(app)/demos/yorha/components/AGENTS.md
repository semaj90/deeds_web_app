# AGENTS.md — `src/routes/(app)/demos/yorha/components`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/routes/(app)/demos/yorha/components

## Snapshot

- src/routes/(app)/demos/yorha/components/CaseTheoryConstructor.svelte, src/routes/(app)/demos/yorha/components/ContradictionReveal.svelte, src/routes/(app)/demos/yorha/components/CrossExaminationAssistant.svelte, src/routes/(app)/demos/yorha/components/DetectiveEvidenceMap.svelte, src/routes/(app)/demos/yorha/components/EnhancedYoRHaAIAssistant.svelte
- Audit score: **50/100** ⚠️
- 🔴 SSR-unsafe: 2 · 🟠 hardcoded localhost: 1
- Tags: `components`

## Files (4)

- `CrossExaminationAssistant.svelte`
- `EnhancedYoRHaAIAssistant.svelte`
- `JudicialAnalysisAgent.svelte`
- `YoRHaAIChat.svelte`

## Hypergraph cluster

This directory is part of cluster **C97** — component chunks in \`src/lib/components/yorha\` (tag: embedding)

- **Top kinds**: component×2
- **Top tags**: `embedding`

See `docs/graph/hypergraph-clusters.md` § Cluster 97 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "components", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "yorha components", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/routes/(app)/demos/yorha/components/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
