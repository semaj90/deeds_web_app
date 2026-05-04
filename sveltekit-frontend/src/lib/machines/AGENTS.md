# AGENTS.md — `src/lib/machines`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/machines

## Snapshot

- shared library directory with 12 files, 0 API handlers, 1 SSR-unsafe
- Audit score: **75/100**
- 🔴 SSR-unsafe: 1 · 🟠 hardcoded localhost: 1
- Tags: `src` `lib` `machines` `component` `zod` `ssr-unsafe`

## Files (12)

- `AIAssistantMachineComponent.svelte`
- `audio-upload-machine.ts`
- `auth-machine.ts`
- `document-upload-machine.ts`
- `evidence-analysis-machine.ts`
- `evidence-lifecycle-machine.ts`
- `evidence-processing-machine.ts`
- `evidenceCustodyMachine.ts`

## Hypergraph cluster

This directory is part of cluster **C96** — type chunks in \`src/lib/server\` (tag: embedding)

- **Top kinds**: type×12, const×2, function×2
- **Top tags**: `embedding` `redis` `vector` `types` `rabbitmq`

See `docs/graph/hypergraph-clusters.md` § Cluster 96 for full digest.

## Warnings

- ⚠️ 1 SSR-unsafe globals
- ⚠️ Hardcoded localhost refs

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "machines", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib machines", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/machines/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
