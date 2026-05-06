# AGENTS.md — `src/lib/server/gpu`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T23:09:49.059Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/gpu

## Snapshot

- server module directory with 11 files, 0 API handlers, 2 Drizzle refs
- Audit score: **95/100**
- 🟠 hardcoded localhost: 2
- Tags: `src` `lib` `server` `db-schema` `zod` `mjs`

## Files (11)

- `src/lib/server/gpu/autoencoder-bridge.ts`
- `src/lib/server/gpu/background-analyzer.ts`
- `src/lib/server/gpu/cuda-bridge.ts`
- `src/lib/server/gpu/gpu-monitor.ts`
- `src/lib/server/gpu/libtorch-bridge.ts`

## Warnings

- ⚠️ Hardcoded localhost refs

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 0/11 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "gpu", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server gpu", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/gpu/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
