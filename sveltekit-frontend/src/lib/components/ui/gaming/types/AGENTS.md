# AGENTS.md — `src/lib/components/ui/gaming/types`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/components/ui/gaming/types

## Snapshot

- src/lib/components/ui/gaming/types/gaming-types-minimal.ts, src/lib/components/ui/gaming/types/gaming-types.ts
- Audit score: **45/100** ⚠️
- no audit signals
- Tags: `types` `low-score`

## Files (2)

- `gaming-types-minimal.ts`
- `gaming-types.ts`

## Hypergraph cluster

This directory is part of cluster **C30** — type chunks in \`src/lib/components/ui/gaming/types\`

- **Top kinds**: type×2


See `docs/graph/hypergraph-clusters.md` § Cluster 30 for full digest.

## Warnings

- ⚠️ Score 45 below threshold

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "types", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "gaming types", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/components/ui/gaming/types/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
