# AGENTS.md — `tests/routes/auto/api`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-09T22:22:23.446Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: tests/routes/auto/api

## Snapshot

- route handler directory with 586 files, 0 API handlers
- Audit score: **90/100**
- no audit signals
- Tags: `tests` `routes` `auto` `auth` `test`

## Files (43)

- `tests/routes/auto/api/ace/agent.test.ts`
- `tests/routes/auto/api/ace/context.test.ts`
- `tests/routes/auto/api/ace/error-kag.test.ts`
- `tests/routes/auto/api/ace/health.test.ts`
- `tests/routes/auto/api/ace/ingest.test.ts`

## Tools

> MCP tools the Gemma4 agent should reach for inside this directory.
- kag.multi_lane_search
- graph.expand_neighborhood
- topology.same_som_cluster
- clusters.get_members
- context.build_kv_packet
- taxonomy.children

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 0/43 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "api", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "auto api", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "tests/routes/auto/api/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
