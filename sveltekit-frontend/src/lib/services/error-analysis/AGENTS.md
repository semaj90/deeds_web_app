# AGENTS.md — `src/lib/services/error-analysis`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/services/error-analysis

## Snapshot

- shared library directory with 17 files, 0 API handlers
- Audit score: **85/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `services` `zod`

## Files (17)

- `CacheService.ts`
- `DecisionEngine.ts`
- `ErrorClustering.ts`
- `EscalationService.ts`
- `ExperienceRecorder.ts`
- `FixSynthesizer.ts`
- `GRPOPolicy.ts`
- `index.ts`

## Hypergraph cluster

This directory is part of cluster **C17** — function chunks in \`src/lib/services/error-analysis\` (tag: embedding)

- **Top kinds**: function×15
- **Top tags**: `embedding` `server-module` `cache` `vector` `redis`

See `docs/graph/hypergraph-clusters.md` § Cluster 17 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "error-analysis", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "services error-analysis", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/services/error-analysis/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
