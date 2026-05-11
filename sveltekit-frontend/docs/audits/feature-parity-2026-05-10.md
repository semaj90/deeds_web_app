# Feature Parity Audit — 2026-05-10

**Method**: parsed `docs/master_agents.md` feature atlas, cross-referenced with all `AGENTS.md`, `codebase-graph.json`, `codebase-map.md`. Verified per-feature that canonical files / routes / MCP tools resolve.

**Note**: this audit was performed by the obsidian-cartographer subagent which returned findings inline (no MCP exercise of live `:8788` / `:8789` surfaces — counts are source-level).

## Summary

| Status | Count |
|--------|-------|
| `implemented` | 14 |
| `partial` | 3 |
| `stale_doc` | 1 |
| `docs_only` | 0 |
| `schema_blocked` | 0 |
| `runtime_blocked` | 0 |
| `missing_import` | 0 |
| `deprecated` | 0 |
| **Total tracked** | **18** |

---

## Feature-by-feature

| # | Feature key | Status | Canonical file | Route / Surface | MCP tools | Evidence |
|---|-------------|--------|----------------|-----------------|-----------|----------|
| 1 | `hyperrag.lane.topo_prefilter` (L0) | `implemented` | `src/lib/server/cache/topo-candidate-cache.ts` | internal (Stage A0) | — | Redis key shape `ace:topo:{topoClass}:{queryHash}` matches docs |
| 2 | `hyperrag.lane.qdrant_dense` (L1) | `implemented` | `src/lib/server/vector/qdrant-manager.ts` | internal | `kb.hybrid_search`, `search.hybrid` | imports `bm42-sparse.ts` + sparse generation |
| 3 | `hyperrag.lane.qdrant_signature` (L2) | `implemented` | `src/lib/server/vector/qdrant-manager.ts` | internal | `kb.hybrid_search` | same manager handles both vectors |
| 4 | `hyperrag.lane.summary_lenses` (L3) | `stale_doc` | declared: `src/lib/server/ace/context-assembler.ts` — **actual**: `src/lib/server/indexer/summary-lens-generator.ts` + `src/lib/server/config/vector-config.ts` | internal | `clusters.get_summary_lenses` | `context-assembler.ts` has 0 hits for `summary_lenses_768`; literal lives in 10 other files |
| 5 | `hyperrag.lane.wiki_agents_md` (L4) | `implemented` | `src/lib/server/ace/context-assembler.ts` | internal | `agents_md.context_for_file`, `agents_md.peers_for_dir` | `wiki:note:` and `agents:dir:` patterns found |
| 6 | `hyperrag.lane.synthesis_memory` (L5) | `partial` | declared: `context-assembler.ts` — **actual** `synthesis_memory_768` lit is in `vector-config.ts` + `trust-tiers.ts` + `couchdb/memory-mirror.ts` | internal | — | Lane is wired through helpers; canonical pointer in master_agents.md is wrong |
| 7 | `hyperrag.lane.prior_answers` (L6) | `implemented` | `src/lib/server/ace/context-assembler.ts` | internal | `kag.recall_similar_fix`, `ops.fixer_semantic_recall` | `code:llm:` references found |
| 8 | `hyperrag.lane.graph_neighbors` (L7) | `implemented` | `src/lib/server/ace/multi-lane-retrieval.ts` | internal | `graph.expand_neighborhood`, `graph.shortest_path`, `graph.community_for_node` | multi-tool MCP surface present |
| 9 | `hyperrag.lane.pagerank_authority` (L8) | `implemented` | `scripts/karpathy-gpu-enrich.mjs` | npm: `karpathy:gpu` | `graph.pagerank_top` | header docstring matches |
| 10 | `hyperrag.lane.feature_atlas` (L9) | `implemented` | `src/lib/server/ace/context-assembler.ts` + tables `feature_implementations` / `feature_file_edges` | internal | `kag.feature_lookup` | Drizzle tables present |
| 11 | `hyperrag.lane.web_external` (L10) | `implemented` | `src/lib/server/ace/context-assembler.ts` | internal + `/api/research/web-search` | `kag.web_search`, `kb.search_external_research` | SEARXNG_URL referenced in 14 files; `context-assembler.ts` imports `webSearch` + `webSearchToUnified` |
| 12 | `hyperrag.lane.activity_prefetch` (L11) | `partial` | `src/routes/api/analytics/panel-activity/+server.ts` | route exists | — | Route + `panelActivityLog` Drizzle table exist; but `panel_activity` text NOT in `context-assembler.ts` → consumer side may be stub-only |
| 13 | `ace.context_pack` | `implemented` | `src/lib/server/ace/context-assembler.ts` | internal | `kb.explain_context_pack`, `context.build_kv_packet` | `ACE_PIPELINE_VERSION = '3.0.0'` at line 1522 |
| 14 | `ace.trust_tiers` | `implemented` | `src/lib/server/ace/sanitizer.ts` + `types.ts` | internal | `ops.trust_audit` | T4/T5 + 8-pattern injection per header |
| 15 | `karpathy.gpu_blend` | `implemented` | `scripts/karpathy-gpu-enrich.mjs` | npm: `karpathy:gpu`, `karpathy:gpu:dirty`, `karpathy:gpu:top200` | `graph.pagerank_top`, `search.rerank` | Redis keys `gpu:karpathy:scores/encoded/summary` documented |
| 16 | `mcp.trace_server` | `implemented` | `src/mcp/trace-mcp-server.ts` | HTTP :8788 | **74 `server.registerTool()` calls** at source level — master_agents.md claim "73" within ±1 | All key tools present at expected source lines |
| 17 | `hypergraph.4d` | `implemented` | `scripts/run-hypergraph.ts` + `scripts/run-pagerank.ts` | npm: `graphify:full` | `hypergraph.search`, `hypergraph.get_edge`, `hypergraph.expand_members`, `hypergraph.semantic_path_synthesis`, `hypergraph.explain_activation` | Both standalone scripts present |
| 18 | `synth.loop` | `implemented` | `src/mcp/trace-mcp-server.ts` + `kb-retrieval-server.ts` (:8789) | HTTP :8788 + :8789 | `kag.multi_lane_search`, `kb.search_external_research`, `tools.batch_call` | second MCP server on :8789 confirmed |

---

## AGENTS.md disagreements

### Disagreement 1 — stale G53 grep pattern
`src/lib/server/ace/AGENTS.md` line 110-113 (G53 check) greps for `ACE_PIPELINE_VERSION = '2\.'`. The live constant in `context-assembler.ts:1522` is `'3.0.0'`. Next directory-AGENTS regeneration will flag a false negative. **Recommend:** `npm run agents:write` to refresh.

### Disagreement 2 — file count mismatch on `src/lib/server/ace`
master_agents.md §3 Tier A says `~12 files`. The directory `AGENTS.md` (auto-generated 2026-05-09) says `30 files`. Both auto-generated at different times. The `~12` in master_agents.md is a hand-curated approximation. **Recommend:** drop the count from master_agents.md OR auto-fill from directory AGENTS.md.

### Disagreement 3 — Audit-gate counts not surfaced in master
Top-level `sveltekit-frontend/AGENTS.md` reports `G15 SSR-unsafe globals: 2❌` and `G16 Routes without tests: 33❌` — real outstanding gaps NOT in master_agents.md gate-status table. **Recommend:** echo current snapshot counts into master_agents.md §4 OR add a footnote.

---

## Things this audit could NOT verify

- **Per-MCP-tool reachability**: confirmed 74 `server.registerTool(...)` at source level but did NOT exercise live `:8788`. Per `memory/architecture/mcp-mount-smoke-2026-05-09.md`, the smoke pass shows ~42 reach `tools/list` cleanly after the per-request transport fix. So **~32 registered tools may be silently failing**. Master_agents.md "73 registered" is source-true; "73 reachable" is not.
- **codebase-graph.json edge integrity** — 138 mentions of canonical files confirmed but stale-edges audit needs a dedicated traversal pass.
- **`memory/atlas/codebase-atlas.dirs.json`** is ~319K tokens — too large to inline-verify.

---

## Recommended doc updates (DO NOT apply automatically)

1. **`master_agents.md` L3 row** — change canonical file from `src/lib/server/ace/context-assembler.ts` to `src/lib/server/indexer/summary-lens-generator.ts` (or add a second column "consumer file").
2. **`master_agents.md` L5 row** — canonical should be `src/lib/server/couchdb/memory-mirror.ts` or `src/lib/server/config/vector-config.ts`; context-assembler is the consumer not the producer.
3. **`master_agents.md` L11 row** — mark as "route live, consumer in `context-assembler.ts` is pending" — current text implies full wiring.
4. **Regenerate `src/lib/server/ace/AGENTS.md`** via `npm run agents:write` so G53 grep tracks `'3\\.'`.
5. **`master_agents.md` §4** — link to `memory/architecture/mcp-mount-smoke-2026-05-09.md` so the 73-registered vs 42-reachable gap is explicit.
6. **`master_agents.md` §6** — Add KB Retrieval Server (`src/mcp/kb-retrieval-server.ts` on `:8789`) — second MCP server currently undocumented at top level.

---

## 5-line "most broken" summary

1. **L3 `summary_lenses` is `stale_doc`** — canonical file pointer wrong; literal lives in `summary-lens-generator.ts` not `context-assembler.ts`.
2. **L5 `synthesis_memory` is `partial`** — same shape as L3; canonical file pointer wrong, lane is wired through helpers.
3. **L11 `activity_prefetch` is `partial`** — route + table exist, but consumer side in `context-assembler.ts` may be stub-only.
4. **G53 gate in `src/lib/server/ace/AGENTS.md` still greps for `'2\\.'`** while live version is `'3.0.0'` — false-negative on next regeneration.
5. **`mcp.trace_server` reports 74 registered tools** but May 9 smoke log shows only 42 reach `tools/list` cleanly — master_agents.md "73 registered" overstates the model-facing surface.

---

## What this audit does NOT cover

- DB schema drift — see sibling doc `db-schema-drift-2026-05-10.md`
- Missing imports / broken `$lib/services` paths — see Part D output in summary
- Performance / latency parity (does each implemented feature meet its SLA?) — separate audit
- Test coverage parity (does each feature have G16-compliant route tests?) — partial via `G16 Routes without tests: 33❌` count above
