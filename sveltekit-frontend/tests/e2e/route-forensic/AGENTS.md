# AGENTS.md — `tests/e2e/route-forensic`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-14T00:50:41.701Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: tests/e2e/route-forensic

## Snapshot

- module directory with 31 files, 0 API handlers
- Audit score: **85/100**
- 🟠 hardcoded localhost: 1
- Tags: `tests` `e2e` `route-forensic` `test` `auth`

## Files (31)

- `tests/e2e/route-forensic/active-cases.diagnostic.spec.ts`
- `tests/e2e/route-forensic/analysis-center.diagnostic.spec.ts`
- `tests/e2e/route-forensic/analytics.diagnostic.spec.ts`
- `tests/e2e/route-forensic/case-detail.diagnostic.spec.ts`
- `tests/e2e/route-forensic/case-evidence-upload.diagnostic.spec.ts`

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
| G17 | ❌ FAIL | 1/31 files — use env.server.ts getters |

_Gates checked: G17. Run `npm run index:codebase:fast && npm run agents:write` to refresh._
## Todos + Enhancements

- **[HIGH]** [G17] Fix **G17** No hardcoded localhost URLs: 1/31 files — use env.server.ts getters
- **[MED]** Hardcoded localhost refs

_Synthesized from gate scan + KAG warnings + TODO comments. Regenerate: `npm run agents:write`._

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 1/31 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "route-forensic", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "e2e route-forensic", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "tests/e2e/route-forensic/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
