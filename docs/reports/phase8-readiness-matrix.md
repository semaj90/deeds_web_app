# Phase 8 Readiness Matrix

Generated: 2026-07-04T00:59:34.723Z
Overall: PASS

| Check | Status | Duration ms | Command |
|---|---|---:|---|
| summary_surface_verify | PASS | 1685 | `npm run atlas:summary-surface:verify` |
| summary_sanitizer_hardened | PASS | 897 | `npm run atlas:summary-sanitizer:hardened:test` |
| summary_layer_clean_dry | PASS | 1287 | `npm run atlas:summary-layer:clean:dry` |
| bitfrost_semantic_cache_audit | PASS | 40396 | `npm run atlas:bitfrost-semantic-cache:audit` |
| ontology_kag_readiness | PASS | 3784 | `npm run atlas:ontology-kag:readiness` |
| ranker_envelope_readiness | PASS | 1688 | `npm run atlas:ranker-envelope:readiness` |
| acp_transport | PASS | 6913 | `npm run verify:acp-transport` |
| services_probe | PASS | 2861 | `npm run atlas:services:probe` |
| embedding_qdrant_turbovec | PASS | 2949 | `npm run atlas:embedding-qdrant-turbovec:test` |
| gpu_retrieval_summary_fanout | PASS | 11181 | `npm run atlas:gpu-retrieval-summary-fanout:test` |

## Notes

- This matrix is a promotion gate for the query optimization taxonomy.
- Live failures should be fixed before promoting new fanout or accelerator lanes.