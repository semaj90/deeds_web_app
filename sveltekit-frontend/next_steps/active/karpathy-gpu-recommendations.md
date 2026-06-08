# Karpathy GPU Authority Blend

Generated: 2026-06-08T02:59:23.128Z

- FP16 mode: auto (default)
- FP32 compare: false
- GPU addon loaded: true
- GPU attention used: true

| File | PR | Auth | Attn | CPU | GPU | Δ | Peak | Mean | Blend |
|---|---|---|---|---|---|---|---|---|---|
| src/lib/server/db/client.ts | 7.062 | 10702.526 | 0.005 | 0.633 | 0.005 | -0.629 | 0.005 | 0.005 | 3213.584 |
| src/lib/server/ollama.ts | 3.413 | 5299.567 | 0.005 | 0.572 | 0.005 | -0.567 | 0.005 | 0.005 | 1591.237 |
| src/lib/server/grpc/embedding-client.ts | 1.851 | 1087.117 | 0.005 | 0.618 | 0.005 | -0.613 | 0.005 | 0.005 | 326.877 |
| src/lib/server/vector/qdrant-manager.ts | 1.809 | 313.317 | 0.005 | 0.572 | 0.005 | -0.567 | 0.005 | 0.005 | 94.720 |
| src/lib/server/db/schema-postgres.ts | 4.050 | 249.917 | 0.005 | 0.632 | 0.005 | -0.627 | 0.005 | 0.005 | 76.596 |
| src/lib/server/analytics/event-logger.ts | 1.310 | 135.900 | 0.005 | 0.613 | 0.005 | -0.609 | 0.005 | 0.005 | 41.295 |
| src/lib/server/legal/law-citations.ts | 1.456 | 128.000 | 0.005 | 0.578 | 0.005 | -0.574 | 0.005 | 0.005 | 38.984 |
| src/lib/server/graph/hypergraph-4d.ts | 1.398 | 100.750 | 0.005 | 0.634 | 0.005 | -0.630 | 0.005 | 0.005 | 30.785 |
| src/lib/server/ml/topic-clustering-worker.ts | 1.332 | 97.000 | 0.005 | 0.622 | 0.005 | -0.617 | 0.005 | 0.005 | 29.634 |
| src/lib/server/analytics/web-research-crawler.ts | 1.337 | 86.500 | 0.005 | 0.510 | 0.005 | -0.505 | 0.005 | 0.005 | 26.486 |
| src/lib/server/redis.ts | 3.904 | 73.950 | 0.005 | 0.595 | 0.005 | -0.591 | 0.005 | 0.005 | 23.748 |
| src/lib/server/lucia.ts | 1.778 | 75.833 | 0.005 | 0.635 | 0.005 | -0.631 | 0.005 | 0.005 | 23.463 |
| src/lib/server/cache.ts | 1.899 | 69.533 | 0.005 | 0.637 | 0.005 | -0.633 | 0.005 | 0.005 | 21.621 |
| src/lib/config/env.server.ts | 2.715 | 61.000 | 0.005 | 0.635 | 0.005 | -0.630 | 0.005 | 0.005 | 19.387 |
| src/lib/server/langextract-client.ts | 1.376 | 61.233 | 0.005 | 0.595 | 0.005 | -0.590 | 0.005 | 0.005 | 18.922 |
| src/lib/server/analysis/entity-extraction.ts | 1.300 | 54.167 | 0.005 | 0.522 | 0.005 | -0.517 | 0.005 | 0.005 | 16.771 |
| src/lib/server/indexer/workspace-metadata-extractor.ts | 1.309 | 53.000 | 0.005 | 0.614 | 0.005 | -0.609 | 0.005 | 0.005 | 16.425 |
| src/lib/server/retrieval/web-search.ts | 1.359 | 22.200 | 0.005 | 0.589 | 0.005 | -0.585 | 0.005 | 0.005 | 7.205 |
| src/lib/types/api.ts | 1.386 | 17.000 | 0.005 | 0.610 | 0.005 | -0.605 | 0.005 | 0.005 | 5.656 |
| src/lib/server/observability/langfuse.ts | 2.453 | 11.200 | 0.005 | 0.590 | 0.005 | -0.585 | 0.005 | 0.005 | 4.343 |
| src/lib/server/embeddings/ollama.ts | 1.675 | 11.167 | 0.005 | 0.582 | 0.005 | -0.578 | 0.005 | 0.005 | 4.021 |
| src/lib/server/db/schema/legal-nodes.ts | 1.676 | 10.000 | 0.005 | 0.627 | 0.005 | -0.623 | 0.005 | 0.005 | 3.672 |
| src/lib/server/db/schema/library-documents.ts | 1.796 | 9.000 | 0.005 | 0.642 | 0.005 | -0.637 | 0.005 | 0.005 | 3.420 |
| src/lib/server/minio-client.ts | 1.834 | 7.583 | 0.005 | 0.584 | 0.005 | -0.580 | 0.005 | 0.005 | 3.010 |
| src/lib/server/embedding-cache-service.ts | 1.278 | 8.000 | 0.005 | 0.599 | 0.005 | -0.595 | 0.005 | 0.005 | 2.913 |
