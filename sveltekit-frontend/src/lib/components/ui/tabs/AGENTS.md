# AGENTS.md — `src/lib/components/ui/tabs`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/ui/tabs

## Snapshot

- src/lib/components/ui/tabs/index.ts, src/lib/components/ui/tabs/Svelte5TabPanel.svelte, src/lib/components/ui/tabs/Svelte5Tabs.svelte, src/lib/components/ui/tabs/Tabs.svelte, src/lib/components/ui/tabs/TabsContent.svelte
- Audit score: **50/100** ⚠️
- 🔴 SSR-unsafe: 1
- Tags: `tabs`

## Files (9)

- `index.ts`
- `Svelte5TabPanel.svelte`
- `Svelte5Tabs.svelte`
- `Tabs.svelte`
- `TabsContent.svelte`
- `TabsList.svelte`
- `TabsRoot.svelte`
- `TabsTrigger.svelte`

## Hypergraph cluster

This directory is part of cluster **C67** — const chunks in \`src/lib/components/ui/tabs\`

- **Top kinds**: const×3


See `docs/graph/hypergraph-clusters.md` § Cluster 67 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "tabs", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "ui tabs", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/ui/tabs/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
