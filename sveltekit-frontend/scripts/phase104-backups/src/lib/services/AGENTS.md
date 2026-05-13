# AGENTS.md — `scripts/phase104-backups/src/lib/services`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-13T05:38:18.598Z · agents.md spec · regen: npm run agents:write -->

> Directory: scripts/phase104-backups/src/lib/services

## Snapshot

- 109 file(s), 0 handler(s)
- Audit score: _(no GPU audit)_
- 🟠 hardcoded localhost: 3 · TODOs: 16


## Files (109)

- `advanced-bit-encoder.ts`
- `advanced-simd-pipeline.ts`
- `ai-error-fixer.ts`
- `ai-evidence-analyzer.ts`
- `ai-service.ts`
- `ai-suggestions-grpc-client.ts`
- `ai-worker-manager.ts`
- `aiAutoTagging.ts`

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
| G17 | ❌ FAIL | 3/109 files — use env.server.ts getters |
| G25 | ❌ FAIL | 5 plain .ts file(s) use rune syntax |

_Gates checked: G17, G25. Run `npm run index:codebase:fast && npm run agents:write` to refresh._
## Todos + Enhancements

- **[HIGH]** [G17] Fix **G17** No hardcoded localhost URLs: 3/109 files — use env.server.ts getters
- **[HIGH]** [G25] Fix **G25** No rune calls in plain .ts: 5 plain .ts file(s) use rune syntax
- **[LOW]** [TODO] `cuda-vector-integration.ts`: TODO
- **[LOW]** [TODO] `cuda-vector-integration.ts`: TODO
- **[LOW]** [TODO] `cuda-vector-integration.ts`: TODO
- **[LOW]** [TODO] `vector-service.ts`: TODO
- **[LOW]** [TODO] `vector-service.ts`: TODO
- **[LOW]** [TODO] `vector-service.ts`: TODO

_Synthesized from gate scan + KAG warnings + TODO comments. Regenerate: `npm run agents:write`._

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 1/109 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "services", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib services", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "scripts/phase104-backups/src/lib/services/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
