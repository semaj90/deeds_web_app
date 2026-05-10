# AGENTS.md — `tests/routes/auto/api/rag`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-09T22:22:23.446Z · agents.md spec · regen: npm run agents:write -->

> Directory: tests/routes/auto/api/rag

## Snapshot

- 9 file(s), 0 handler(s)
- Audit score: _(no GPU audit)_
- no audit signals


## Files (9)

- `answer.test.ts`
- `documents.test.ts`
- `enhanced.test.ts`
- `process.test.ts`
- `search.test.ts`
- `suggestions.test.ts`
- `todo-suggestions.test.ts`
- `unified.test.ts`

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
- **Paired tests**: 0/9 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "rag", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "api rag", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "tests/routes/auto/api/rag/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
