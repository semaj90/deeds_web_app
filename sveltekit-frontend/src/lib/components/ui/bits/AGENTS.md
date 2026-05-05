# AGENTS.md — `src/lib/components/ui/bits`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/ui/bits

## Snapshot

- src/lib/components/ui/bits/Button.svelte, src/lib/components/ui/bits/compound.ts, src/lib/components/ui/bits/index.ts, src/lib/components/ui/bits/Svelte5Button.svelte, src/lib/components/ui/bits/Svelte5Dialog.svelte
- Audit score: **50/100** ⚠️
- no audit signals
- Tags: `bits`

## Files (5)

- `Button.svelte`
- `compound.ts`
- `index.ts`
- `Svelte5Button.svelte`
- `Svelte5Dialog.svelte`


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "bits", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "ui bits", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/ui/bits/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
