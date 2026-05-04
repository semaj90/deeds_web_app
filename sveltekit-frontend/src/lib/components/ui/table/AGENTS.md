# AGENTS.md — `src/lib/components/ui/table`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/ui/table

## Snapshot

- src/lib/components/ui/table/index.ts, src/lib/components/ui/table/Table.svelte, src/lib/components/ui/table/TableBody.svelte, src/lib/components/ui/table/TableCaption.svelte, src/lib/components/ui/table/TableCell.svelte
- Audit score: **50/100** ⚠️
- no audit signals
- Tags: `table`

## Files (8)

- `index.ts`
- `Table.svelte`
- `TableBody.svelte`
- `TableCaption.svelte`
- `TableCell.svelte`
- `TableHead.svelte`
- `TableHeader.svelte`
- `TableRow.svelte`


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "table", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "ui table", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/ui/table/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
