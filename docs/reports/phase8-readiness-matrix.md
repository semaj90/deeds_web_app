# Phase 8 Readiness Matrix

Generated: 2026-07-11T07:14:45.913Z
Overall: PASS

| Check | Status | Duration ms | Command |
|---|---|---:|---|
| summary_surface_verify | PASS | 1696 | `npm run atlas:summary-surface:verify` |
| summary_sanitizer_hardened | PASS | 5033 | `npm run atlas:summary-sanitizer:hardened:test` |
| summary_layer_clean_dry | PASS | 3390 | `npm run atlas:summary-layer:clean:dry` |
| phase8_step3_langextract_gate | PASS | 17595 | `npm run atlas:phase8:step3:langextract:gate` |
| bitfrost_semantic_cache_audit | PASS | 6323 | `npm run atlas:bitfrost-semantic-cache:audit` |
| tree_nodes_audit | PASS | 2926 | `npm run atlas:tree-nodes:audit` |
| ontology_kag_readiness | PASS | 4039 | `npm run atlas:ontology-kag:readiness` |
| ranker_envelope_readiness | PASS | 1797 | `npm run atlas:ranker-envelope:readiness` |
| acp_transport | PASS | 8388 | `npm run verify:acp-transport` |
| services_probe | PASS | 3146 | `npm run atlas:services:probe` |
| embedding_qdrant_turbovec | PASS | 14244 | `npm run atlas:embedding-qdrant-turbovec:test` |
| gpu_retrieval_summary_fanout | PASS | 16562 | `npm run atlas:gpu-retrieval-summary-fanout:test` |

## Notes

- This matrix is a promotion gate for the query optimization taxonomy.
- Live failures should be fixed before promoting new fanout or accelerator lanes.