# AGENTS.md — `sveltekit-frontend`

## 2026-05-21 - Codebase Map / Atlas / Semantic Index Update

- Analyzed 3,223 deterministic source files.
- Enriched top 45 files with Gemma4 summaries.
- Wrote `docs/graph/batch-gpu-analysis-report.json`.
- Updated `docs/graph/codebase-map.md`.
- Updated `memory/atlas/codebase-atlas.latest.md`.
- Generated summary-card plan for path, symbol, route, table, tool, error, and test mappings.
- Next: top-100 summary cards, Qdrant centroid tags, Neo4j GraphRAG report, CouchDB report snapshot, DuckDB analytics report.
<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-15T03:29:31.367Z · agents.md spec · regen: npm run agents:write -->

> Directory: sveltekit-frontend

## Snapshot

- 78 file(s), 0 handler(s)
- Audit score: _(no GPU audit)_
- 🟡 Svelte4: 3 · 🟠 hardcoded localhost: 10
- 🚀 **Hardware**: LibTorch CUDA bridge (Verified) · Port 8101 Topology Server (Active)

## Infrastructure Guides

- [Startup & CUDA Bridge Wiring](docs/infrastructure/startup_infrastructure_guide.md) — troubleshooting path regressions and gRPC/JSON boundaries.



## Files (78)

- `.eslint-cache.json`
- `.port-allocation.json`
- `add_kb_tools.cjs`
- `ambient.d.ts`
- `any-type-fixes.json`
- `asconfig.json`
- `CMakePresets.json`
- `codebase-index.json`

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
| G21-24 | ❌ FAIL | 3/6 files with Svelte 4 patterns |
| G20 | ✅ PASS | clean ✅ |
| G17 | ❌ FAIL | 10/78 files — use env.server.ts getters |

_Gates checked: G21-24, G20, G17. Run `npm run index:codebase:fast && npm run agents:write` to refresh._
## Todos + Enhancements

- **[HIGH]** [G21-24] Fix **G21-24** Svelte 5 rune compliance: 3/6 files with Svelte 4 patterns
- **[HIGH]** [G17] Fix **G17** No hardcoded localhost URLs: 10/78 files — use env.server.ts getters

_Synthesized from gate scan + KAG warnings + TODO comments. Regenerate: `npm run agents:write`._

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 1/78 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "sveltekit-frontend", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "sveltekit-frontend", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "sveltekit-frontend/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.

<!-- ingest: 2026-05-30T02:17:10.013Z -->
- ingested_nodes: 18742 from C:\Users\james\Videos\deeds-web-app\.opencode\cards

[2026-05-30T04:39:26.319Z] Phase19 CSV export and archive-preview generated (dry-run)
<!-- atlas-append:0bf81df426b5:2026-05-30T16:27:00.892Z -->
## Atlas Activity — 2026-05-30T16:27:00.892Z

- **Parent atlas rebuild**: 10,732 nodes / 9,378 edges across 8 lanes
- **Redis cache**: 10,732 nodes warmed (24h TTL)
- **CouchDB archive**: 11,136 docs durably persisted
- **This directory**: no tasks or fixes in current run

<!-- /atlas-append:0bf81df426b5 -->

