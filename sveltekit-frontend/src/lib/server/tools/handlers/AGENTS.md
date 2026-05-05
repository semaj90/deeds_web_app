# AGENTS.md — `src/lib/server/tools/handlers`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/server/tools/handlers

## Snapshot

- src/lib/server/tools/handlers/chunkEmbed.ts, src/lib/server/tools/handlers/clusterTag.ts, src/lib/server/tools/handlers/crawlDocs.ts, src/lib/server/tools/handlers/index.ts, src/lib/server/tools/handlers/kbSearch.ts
- Audit score: **50/100** ⚠️
- no audit signals
- Tags: `handlers`

## Files (8)

- `chunkEmbed.ts`
- `clusterTag.ts`
- `crawlDocs.ts`
- `index.ts`
- `kbSearch.ts`
- `langextractBatch.ts`
- `research.ts`
- `scanRepo.ts`

## Hypergraph cluster

This directory is part of cluster **C70** — route-handler chunks in \`src/lib/server/analytics\` (tag: embedding)

- **Top kinds**: route-handler×8, function×7, const×1
- **Top tags**: `embedding` `api` `server` `vector` `redis`

See `docs/graph/hypergraph-clusters.md` § Cluster 70 for full digest.


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "handlers", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "tools handlers", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/server/tools/handlers/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
