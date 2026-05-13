# AGENTS.md — `scripts/smoke`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-13T05:38:18.598Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: scripts/smoke

## Snapshot

- module directory with 16 files, 0 API handlers, 3 Drizzle refs
- Audit score: **95/100**
- 🟠 hardcoded localhost: 3
- Tags: `mjs` `scripts` `smoke` `embeddinggemma-smoke.mjs` `gemma4-tool-call-smoke.mjs` `zod`

## Files (16)

- `scripts/smoke/embeddinggemma-smoke.mjs`
- `scripts/smoke/gemma4-tool-call-smoke.mjs`
- `scripts/smoke/hypergraph-search-smoke.mjs`
- `scripts/smoke/hypergraph-vault-smoke.mjs`
- `scripts/smoke/llama-openai-smoke.mjs`

## Constraints

> Forbidden / risky patterns. Derived from audit warnings + gate FAILs.

- ⚠️ Hardcoded localhost refs

## Tools

> MCP tools the Gemma4 agent should reach for inside this directory.
- kag.multi_lane_search
- graph.expand_neighborhood
- topology.same_som_cluster
- clusters.get_members
- context.build_kv_packet
- taxonomy.children
## Audit Gates

| Gate | Status | Detail |
|------|--------|--------|
| G17 | ❌ FAIL | 3/16 files — use env.server.ts getters |

_Gates checked: G17. Run `npm run index:codebase:fast && npm run agents:write` to refresh._
## Todos + Enhancements

- **[HIGH]** [G17] Fix **G17** No hardcoded localhost URLs: 3/16 files — use env.server.ts getters
- **[MED]** Hardcoded localhost refs

_Synthesized from gate scan + KAG warnings + TODO comments. Regenerate: `npm run agents:write`._

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 0/16 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "smoke", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "scripts smoke", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "scripts/smoke/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
