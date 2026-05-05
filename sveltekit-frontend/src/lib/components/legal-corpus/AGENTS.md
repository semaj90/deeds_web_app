# AGENTS.md — `src/lib/components/legal-corpus`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/legal-corpus

## Snapshot

- shared library directory with 8 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `components` `component`

## Files (8)

- `CitedSourcesDrawer.svelte`
- `CorpusSidebar.svelte`
- `LegalBreadcrumbs.svelte`
- `LegalCorpusClassicView.svelte`
- `LegalCorpusDemoView.svelte`
- `LegalDocumentHeader.svelte`
- `LegalMetadataBar.svelte`
- `LegalTabBar.svelte`

## Hypergraph cluster

This directory is part of cluster **C35** — component chunks in \`src/lib/components/legal-ai\` (tag: component)

- **Top kinds**: component×16
- **Top tags**: `component` `page` `vector` `layout`

See `docs/graph/hypergraph-clusters.md` § Cluster 35 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "legal-corpus", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components legal-corpus", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/legal-corpus/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
