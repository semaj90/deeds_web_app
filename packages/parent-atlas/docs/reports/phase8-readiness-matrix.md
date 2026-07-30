# Phase 8 Readiness Matrix

Generated: 2026-07-30T13:47:37.550Z
Overall: WARN

| Check | Status | Duration ms | Command |
|---|---|---:|---|
| summary_surface_verify | FAIL | 588 | `npm run atlas:summary-surface:verify` |
| summary_sanitizer_hardened | FAIL | 510 | `npm run atlas:summary-sanitizer:hardened:test` |
| summary_layer_clean_dry | FAIL | 529 | `npm run atlas:summary-layer:clean:dry` |
| phase8_step3_langextract_gate | FAIL | 544 | `npm run atlas:phase8:step3:langextract:gate` |
| bitfrost_semantic_cache_audit | FAIL | 435 | `npm run atlas:bitfrost-semantic-cache:audit` |
| tree_nodes_audit | FAIL | 448 | `npm run atlas:tree-nodes:audit` |
| ontology_kag_readiness | FAIL | 475 | `npm run atlas:ontology-kag:readiness` |
| ranker_envelope_readiness | FAIL | 392 | `npm run atlas:ranker-envelope:readiness` |
| acp_transport | FAIL | 437 | `npm run verify:acp-transport` |
| services_probe | FAIL | 397 | `npm run atlas:services:probe` |
| embedding_qdrant_turbovec | FAIL | 384 | `npm run atlas:embedding-qdrant-turbovec:test` |
| gpu_retrieval_summary_fanout | FAIL | 387 | `npm run atlas:gpu-retrieval-summary-fanout:test` |

## Notes

- This matrix is a promotion gate for the query optimization taxonomy.
- Live failures should be fixed before promoting new fanout or accelerator lanes.