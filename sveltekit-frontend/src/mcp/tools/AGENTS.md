# AGENTS.md — `src/mcp/tools`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-06T23:09:49.059Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/mcp/tools

## Snapshot

- module directory with 5 files, 0 API handlers
- Audit score: **85/100**
- 🟠 hardcoded localhost: 1
- Tags: `src` `mcp` `tools` `zod`

## Files (5)

- `src/mcp/tools/cluster-lenses.tool.ts`
- `src/mcp/tools/graph-analysis.tool.ts`
- `src/mcp/tools/topology-search.tool.ts`
- `src/mcp/tools/trace-kag.tool.ts`
- `src/mcp/tools/video-analysis.ts`

## Warnings

- ⚠️ Hardcoded localhost refs

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 0/5 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "tools", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "mcp tools", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/mcp/tools/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
