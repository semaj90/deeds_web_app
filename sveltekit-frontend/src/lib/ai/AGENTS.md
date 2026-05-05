# AGENTS.md — `src/lib/ai`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/ai

## Snapshot

- shared library directory with 13 files, 0 API handlers, 1 TODOs
- Audit score: **78/100**
- 🟠 hardcoded localhost: 2
- Tags: `src` `lib` `ai` `zod` `has-todo`

## Files (13)

- `base64-fp32-quantizer.ts`
- `citation-cache.ts`
- `client-cache.ts`
- `client-embed.ts`
- `client-llm-synthesis.ts`
- `client-quality.ts`
- `client-router.ts`
- `emotion-context.ts`

## Hypergraph cluster

This directory is part of cluster **C14** — function chunks in \`src/lib/ai\` (tag: ai)

- **Top kinds**: function×1
- **Top tags**: `ai` `auth` `embedding`

See `docs/graph/hypergraph-clusters.md` § Cluster 14 for full digest.

## Warnings

- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "ai", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib ai", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/ai/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
