# AGENTS.md — `scripts/diagnose`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-13T05:38:18.598Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: scripts/diagnose

## Snapshot

- module directory with 2 files, 0 API handlers
- Audit score: **85/100**
- 🟠 hardcoded localhost: 1
- Tags: `mjs` `scripts` `diagnose` `find-non-zod-tool-schemas.mjs` `probe-tools-list-by-module.mjs`

## Files (2)

- `scripts/diagnose/find-non-zod-tool-schemas.mjs`
- `scripts/diagnose/probe-tools-list-by-module.mjs`

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
| G17 | ❌ FAIL | 1/2 files — use env.server.ts getters |

_Gates checked: G17. Run `npm run index:codebase:fast && npm run agents:write` to refresh._
## Todos + Enhancements

- **[HIGH]** [G17] Fix **G17** No hardcoded localhost URLs: 1/2 files — use env.server.ts getters
- **[MED]** Hardcoded localhost refs

_Synthesized from gate scan + KAG warnings + TODO comments. Regenerate: `npm run agents:write`._

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 0/2 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "diagnose", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "scripts diagnose", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "scripts/diagnose/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
