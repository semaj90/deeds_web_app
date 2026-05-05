# AGENTS.md — `src/lib/components/detective`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/detective

## Snapshot

- shared library directory with 6 files, 0 API handlers, 1 SSR-unsafe
- Audit score: **80/100**
- 🔴 SSR-unsafe: 1
- Tags: `src` `lib` `components` `component` `zod` `ssr-unsafe`

## Files (6)

- `ContextualDetectiveBoard.svelte`
- `DetectiveBoard.svelte`
- `EvidenceCard.svelte`
- `EvidenceTheoryBoard.svelte`
- `index.ts`
- `UploadZone.svelte`

## Warnings

- ⚠️ 1 SSR-unsafe globals

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "detective", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "components detective", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/detective/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
