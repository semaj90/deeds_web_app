# Domain Classification Readiness Audit

Generated: 2026-09-01T22:12:29.970Z
Status: READY_WITH_GAPS

## Coverage

| Lane | Coverage | Threshold | Status |
|---|---:|---:|---|
| identity spine | 100% source_ref, 100% tree_node_id | >=95% | PASS |
| feature envelope | used_concepts=96.55%, lexical=99.98%, ast=20.27% | >=95% | FAIL |
| metric lane | nb=100%, jepa=1.48%, kmeans=100%, som=100% | >=95% | PASS |
| embedding corpus | 98.78% content_embedding | >=95% | PASS |
| retrieval mirror | 10.46% qdrant_point_id | >=95% | FAIL |
| topology readiness | som=100%, latent_64=12.2%, pagerank=100% | >=95% | FAIL |
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

1. 0ba2345cd9c542fa | mcp_agents | grpc_service | title:grpc-service:49d48e41 | evidence=10
2. 0bffe0382a0d44bb | mcp_agents | grpc_service | title:grpc-service:84786dd5 | evidence=10
3. 0ee918abc8c53e8d | mcp_agents | grpc_service | title:grpc-service:3df64b80 | evidence=10
4. 1703d9c005252a62 | mcp_agents | grpc_service | title:grpc-service:bef00376 | evidence=10
5. 175066b8a4ceee3c | mcp_agents | grpc_service | title:grpc-service:9aa6c88e | evidence=10
6. 17dc1fe9f5f8a021 | mcp_agents | grpc_service | title:grpc-service:22e93e07 | evidence=10
7. 1d5eba7211dea6f9 | mcp_agents | grpc_service | title:grpc-service:55ae22ab | evidence=10
8. 1dc5ac2b3cd9bfe8 | mcp_agents | grpc_service | title:grpc-service:8cfd5203 | evidence=10
9. 25c824811a2efd81 | mcp_agents | grpc_service | title:grpc-service:579d4f74 | evidence=10
10. 271b5446f6a86a48 | mcp_agents | grpc_service | title:grpc-service:55ab2018 | evidence=10

## Next Steps

1. Backfill atlas_packet_features.ast_symbols, lexical_features, and used_concepts, then rerun the progressive semantic compiler gate.
2. Materialize the packet_key → qdrant_point_id bridge before any payload mutation or RRF fan-out.
3. Recompute latent_64, KMeans, SOM, and pagerank/community metrics after the feature lane stabilizes.

