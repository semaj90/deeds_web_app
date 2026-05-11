# Feature Parity Audit - 2026-05-10

Source: `docs/master_agents.md` feature atlas + live `feature_implementations` / `feature_file_edges` + AGENTS hierarchy.

## Summary
- Most atlas entries are implemented.
- 2 features are blocked by schema drift.
- 1 feature is stale-doc only.
- 1 feature is partial because the core exists but still depends on missing DB objects.

## Atlas Status
| Feature | Status | Evidence |
|---|---|---|
| `hyperrag.lane.topo_prefilter` | implemented | `src/lib/server/cache/topo-candidate-cache.ts`, consumer in `src/lib/server/ace/context-assembler.ts` |
| `hyperrag.lane.qdrant_dense` | implemented | `src/lib/server/vector/qdrant-manager.ts`, consumer in `src/lib/server/ace/multi-lane-retrieval.ts` |
| `hyperrag.lane.qdrant_signature` | implemented | `src/lib/server/vector/qdrant-manager.ts` |
| `hyperrag.lane.summary_lenses` | implemented | `src/lib/server/ace/context-assembler.ts` |
| `hyperrag.lane.wiki_agents_md` | implemented | `src/lib/server/agents-md/resolve-directory-context.ts`, `src/lib/server/ace/context-assembler.ts` |
| `hyperrag.lane.synthesis_memory` | implemented | `src/lib/server/ace/context-assembler.ts` |
| `hyperrag.lane.prior_answers` | schema_blocked | `code_llm_index` is missing in live DB; referenced by `src/lib/server/cache/code-llm-index.ts` and `src/routes/api/graph/cluster-summaries/+server.ts` |
| `hyperrag.lane.graph_neighbors` | implemented | `src/lib/server/ace/multi-lane-retrieval.ts`, consumer in `src/lib/server/graph/graph-informed-retrieval.ts` |
| `hyperrag.lane.pagerank_authority` | implemented | `scripts/karpathy-gpu-enrich.mjs` |
| `hyperrag.lane.feature_atlas` | implemented | `scripts/seed-feature-atlas.mjs`, `feature_implementations` / `feature_file_edges` live |
| `hyperrag.lane.web_external` | stale_doc | Atlas text says `/api/web-research`; actual route surface is `src/routes/api/websearch/+server.ts` and `src/routes/api/research/external-deep/+server.ts` |
| `hyperrag.lane.activity_prefetch` | implemented | `src/routes/api/analytics/panel-activity/+server.ts` |
| `ace.context_pack` | partial | Core exists in `src/lib/server/ace/context-assembler.ts`, but it still depends on missing `web_search_index` / `code_llm_index` |
| `ace.trust_tiers` | implemented | `src/lib/server/ace/sanitizer.ts`, `src/lib/server/ace/types.ts` |
| `karpathy.gpu_blend` | implemented | `scripts/karpathy-gpu-enrich.mjs` |
| `mcp.trace_server` | implemented | `src/mcp/trace-mcp-server.ts` |
| `hypergraph.4d` | implemented | `src/lib/server/graph/hypergraph-4d.ts`, `scripts/run-hypergraph.ts` |
| `synth.loop` | implemented | `scripts/synth/run-loop.mjs`, `scripts/synth/handoff-to-claude.mjs` |

## Notes
- The AGENTS hierarchy is broadly current for the audited directories; the main doc drift is the `web_external` route naming in `docs/master_agents.md`.
- `pgvector-utils.temp.ts` is not a feature issue: it exports the same API as `pgvector-utils.ts`.
- The main runtime blockers are schema-backed features, not the atlas wiring itself.
