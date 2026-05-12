# AGENTS.md — `tests/e2e`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-12T03:12:15.164Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: tests/e2e

## Snapshot

- module directory with 28 files, 0 API handlers
- Audit score: **85/100**
- no audit signals
- Tags: `tests` `e2e` `all-routes-sse.spec.ts` `test` `auth-login-db.spec.ts` `auth`

## Files (28)

- `tests/e2e/all-routes-sse.spec.ts`
- `tests/e2e/auth-login-db.spec.ts`
- `tests/e2e/cases-real-data.spec.ts`
- `tests/e2e/chat-inference-routing.spec.ts`
- `tests/e2e/chat-rag-sse.spec.ts`

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
## Todos + Enhancements

- **[MED]** Hardcoded localhost refs

_Synthesized from gate scan + KAG warnings + TODO comments. Regenerate: `npm run agents:write`._

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 0/28 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "e2e", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "tests e2e", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "tests/e2e/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
