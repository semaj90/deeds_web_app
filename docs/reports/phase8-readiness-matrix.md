# Phase 8 Readiness Matrix

Generated: 2026-07-05T00:05:23.075Z
Overall: WARN

| Check | Status | Duration ms | Command |
|---|---|---:|---|
| summary_surface_verify | PASS | 2756 | `npm run atlas:summary-surface:verify` |
| summary_sanitizer_hardened | PASS | 2288 | `npm run atlas:summary-sanitizer:hardened:test` |
| summary_layer_clean_dry | PASS | 6132 | `npm run atlas:summary-layer:clean:dry` |
| phase8_step3_langextract_gate | PASS | 85770 | `npm run atlas:phase8:step3:langextract:gate` |
| bitfrost_semantic_cache_audit | PASS | 83536 | `npm run atlas:bitfrost-semantic-cache:audit` |
| tree_nodes_audit | PASS | 15666 | `npm run atlas:tree-nodes:audit` |
| ontology_kag_readiness | PASS | 9292 | `npm run atlas:ontology-kag:readiness` |
| ranker_envelope_readiness | PASS | 4319 | `npm run atlas:ranker-envelope:readiness` |
| acp_transport | PASS | 19720 | `npm run verify:acp-transport` |
| services_probe | PASS | 4268 | `npm run atlas:services:probe` |
| embedding_qdrant_turbovec | PASS | 19000 | `npm run atlas:embedding-qdrant-turbovec:test` |
| gpu_retrieval_summary_fanout | FAIL | 6796 | `npm run atlas:gpu-retrieval-summary-fanout:test` |

## Notes

- This matrix is a promotion gate for the query optimization taxonomy.
- Live failures should be fixed before promoting new fanout or accelerator lanes.