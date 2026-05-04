# AGENTS.md — `src/lib/components/ui/gaming/effects`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/ui/gaming/effects

## Snapshot

- src/lib/components/ui/gaming/effects/audio-effects.ts, src/lib/components/ui/gaming/effects/gradient-utils.ts, src/lib/components/ui/gaming/effects/index.ts, src/lib/components/ui/gaming/effects/NES3DLODProcessor.svelte
- Audit score: **50/100** ⚠️
- no audit signals
- Tags: `effects`

## Files (4)

- `audio-effects.ts`
- `gradient-utils.ts`
- `index.ts`
- `NES3DLODProcessor.svelte`


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "effects", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "gaming effects", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/ui/gaming/effects/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
