# AGENTS.md — `scripts/api-cleanup`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-15T03:29:31.367Z · agents.md spec · regen: npm run agents:write -->

> Directory: scripts/api-cleanup

## Snapshot

- 40 file(s), 0 handler(s)
- Audit score: _(no GPU audit)_
- TODOs: 2

## Files (40)

- `build-validator.test.ts`
- `build-validator.ts`
- `categorizer.test.ts`
- `categorizer.ts`
- `disabler.test.ts`
- `disabler.ts`
- `fixer.test.ts`
- `fixer.ts`

## Tools

> MCP tools the Gemma4 agent should reach for inside this directory.
- kag.multi_lane_search
- graph.expand_neighborhood
- topology.same_som_cluster
- clusters.get_members
- context.build_kv_packet
- taxonomy.children
## Todos + Enhancements

- **[LOW]** [TODO] `production-route-fixer.ts`: TODO
- **[LOW]** [TODO] `production-route-fixer.ts`: TODO

_Synthesized from gate scan + KAG warnings + TODO comments. Regenerate: `npm run agents:write`._

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 18/40 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "api-cleanup", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "scripts api-cleanup", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "scripts/api-cleanup/<file>" })` — fetch any file's contents (sandboxed to src/)

## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.

<!-- ingest: 2026-05-30T02:17:10.013Z -->
- ingested_nodes: 18742 from C:\Users\james\Videos\deeds-web-app\.opencode\cards

<!-- atlas-append:0bf81df426b5:2026-05-30T16:27:00.892Z -->
## Atlas Activity — 2026-05-30T16:27:00.892Z

- **Parent atlas rebuild**: 10,732 nodes / 9,378 edges across 8 lanes
- **Redis cache**: 10,732 nodes warmed (24h TTL)
- **CouchDB archive**: 11,136 docs durably persisted
- **This directory**: no tasks or fixes in current run

<!-- /atlas-append:0bf81df426b5 -->

