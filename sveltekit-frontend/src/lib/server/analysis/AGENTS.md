# AGENTS.md — `src/lib/server/analysis`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-04T16:09:09.941Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/analysis

## Snapshot

- server module directory with 12 files, 0 API handlers, 2 Drizzle refs
- Audit score: **100/100**
- no audit signals
- Tags: `src` `lib` `server` `db-schema` `zod`

## Files (12)

- `analysis-jobs.ts`
- `batch-error-analysis.ts`
- `concurrency-gate.ts`
- `entity-extraction.ts`
- `evidence-analysis-pipeline.ts`
- `forensics.ts`
- `granite-docling.ts`
- `hmm-ace-analyzer.ts`

## Hypergraph cluster

This directory is part of cluster **C54** — function chunks in \`src/lib/server/analysis\`

- **Top kinds**: function×7


See `docs/graph/hypergraph-clusters.md` § Cluster 54 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "analysis", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "server analysis", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/analysis/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
