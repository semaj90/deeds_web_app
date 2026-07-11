# Domain Classification Readiness Audit

Generated: 2026-07-11T07:15:52.005Z
Status: READY_WITH_GAPS

## Coverage

| Lane | Coverage | Threshold | Status |
|---|---:|---:|---|
| identity spine | 100% source_ref, 100% tree_node_id | >=95% | PASS |
| feature envelope | used_concepts=99.99%, lexical=99.98%, ast=3.74% | >=95% | FAIL |
| metric lane | nb=100%, jepa=100%, kmeans=0%, som=0% | >=95% | PARTIAL |
| embedding corpus | 99.65% content_embedding | >=95% | PASS |
| retrieval mirror | 8.1% qdrant_point_id | >=95% | FAIL |
| topology readiness | som=7.17%, latent_64=2.14%, pagerank=21.62% | >=95% | FAIL |
| Naive Bayes lane | model present; report=present | train + apply | PASS |
| XGBoost lane | csv=present, meta=present, report=present, model=present | export + train + serve | PASS |
| RRF activation | helpers present; unified-orchestrator TODO=no | wire canonical lane | FAIL |

## Model Artifacts

- Naive Bayes model: present
- Naive Bayes report: present
- XGBoost features CSV: present
- XGBoost training report: present
- XGBoost reranker model: present

## RRF Status

- Helper modules present: yes
- Canonical lane wired: yes
- Activation blocker: none

## Top-K Domain Mapping Samples

1. packet:055b9cde2d66 | frontend | sveltekit-frontend.+server | server.ts | evidence=10
2. packet:07d5bb528993 | frontend | sveltekit-frontend.+server | server.ts | evidence=10
3. packet:156fa8119692 | frontend | sveltekit-frontend.+page.server | page.server.ts | evidence=10
4. packet:18742adf0d17 | frontend | sveltekit-frontend.+server | server.ts | evidence=10
5. packet:1ec59f25ab9e | frontend | sveltekit-frontend.+server | server.ts | evidence=9
6. packet:2c90dd0b0846 | frontend | sveltekit-frontend.+server | server.ts | evidence=9
7. packet:2dd3a5e049f5 | backend | sveltekit-frontend.unified-research-query | unified.research.query.ts | evidence=9
8. packet:2ee20d8a0277 | frontend | sveltekit-frontend.+page.server | page.server.ts | evidence=9
9. packet:3779986ad404 | frontend | sveltekit-frontend.+server | server.ts | evidence=9
10. packet:3e92ce301de6 | frontend | sveltekit-frontend.+server | server.ts | evidence=9

## Next Steps

1. Backfill atlas_packet_features.ast_symbols, lexical_features, and used_concepts, then rerun the progressive semantic compiler gate.
2. Materialize the packet_key → qdrant_point_id bridge before any payload mutation or RRF fan-out.
3. Recompute latent_64, KMeans, SOM, and pagerank/community metrics after the feature lane stabilizes.

