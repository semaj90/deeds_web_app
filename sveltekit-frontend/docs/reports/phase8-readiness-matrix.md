# Phase 8 Readiness Matrix

Generated: 2026-07-04T00:35:02.177Z
Overall: WARN

| Check | Status | Duration ms | Command |
|---|---|---:|---|
| summary_surface_verify | PASS | 1465 | `npm run atlas:summary-surface:verify` |
| summary_sanitizer_hardened | FAIL | 643 | `npm run atlas:summary-sanitizer:hardened:test` |
| summary_layer_clean_dry | FAIL | 689 | `npm run atlas:summary-layer:clean:dry` |
| bitfrost_semantic_cache_audit | FAIL | 696 | `npm run atlas:bitfrost-semantic-cache:audit` |
| ontology_kag_readiness | FAIL | 709 | `npm run atlas:ontology-kag:readiness` |
| ranker_envelope_readiness | FAIL | 613 | `npm run atlas:ranker-envelope:readiness` |
| acp_transport | PASS | 6977 | `npm run verify:acp-transport` |
| services_probe | FAIL | 701 | `npm run atlas:services:probe` |
| embedding_qdrant_turbovec | PASS | 2844 | `npm run atlas:embedding-qdrant-turbovec:test` |
| gpu_retrieval_summary_fanout | PASS | 10189 | `npm run atlas:gpu-retrieval-summary-fanout:test` |

## Notes

- This matrix is a promotion gate for the query optimization taxonomy.
- Live failures should be fixed before promoting new fanout or accelerator lanes.