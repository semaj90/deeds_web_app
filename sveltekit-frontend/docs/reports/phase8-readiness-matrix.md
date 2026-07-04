# Phase 8 Readiness Matrix

Generated: 2026-07-04T09:44:43.089Z
Overall: PASS

| Check | Status | Duration ms | Command |
|---|---|---:|---|
| summary_surface_verify | PASS | 1263 | `npm run atlas:summary-surface:verify` |
| summary_sanitizer_hardened | PASS | 931 | `npm run atlas:summary-sanitizer:hardened:test` |
| summary_layer_clean_dry | PASS | 1254 | `npm run atlas:summary-layer:clean:dry` |
| phase8_step3_langextract_gate | PASS | 9518 | `npm run atlas:phase8:step3:langextract:gate` |
| bitfrost_semantic_cache_audit | PASS | 35983 | `npm run atlas:bitfrost-semantic-cache:audit` |
| tree_nodes_audit | PASS | 1813 | `npm run atlas:tree-nodes:audit` |
| ontology_kag_readiness | PASS | 3799 | `npm run atlas:ontology-kag:readiness` |
| ranker_envelope_readiness | PASS | 1769 | `npm run atlas:ranker-envelope:readiness` |
| acp_transport | PASS | 6176 | `npm run verify:acp-transport` |
| services_probe | PASS | 2810 | `npm run atlas:services:probe` |
| embedding_qdrant_turbovec | PASS | 3135 | `npm run atlas:embedding-qdrant-turbovec:test` |
| gpu_retrieval_summary_fanout | PASS | 8927 | `npm run atlas:gpu-retrieval-summary-fanout:test` |

## Notes

- This matrix is a promotion gate for the query optimization taxonomy.
- Live failures should be fixed before promoting new fanout or accelerator lanes.