# AGENTS.md — `src/lib/components/forms`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/forms

## Snapshot

- shared library directory with 7 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `src` `lib` `components` `component` `zod`

## Files (7)

- `CaseForm.svelte`
- `EnhancedCaseForm.svelte`
- `EnhancedFileUpload.svelte`
- `EvidenceForm.svelte`
- `LegalCaseForm.svelte`
- `ProgressiveForm.svelte`
- `SmartDocumentForm.svelte`

## Hypergraph cluster

This directory is part of cluster **C1** — type chunks in \`src/lib/utils\` (tag: page-component)

- **Top kinds**: type×4, function×1, component×1
- **Top tags**: `page-component` `auth` `ui-component` `server-module` `types`

See `docs/graph/hypergraph-clusters.md` § Cluster 1 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "forms", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components forms", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/forms/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
