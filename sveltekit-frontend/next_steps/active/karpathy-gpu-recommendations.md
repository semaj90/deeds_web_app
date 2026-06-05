# Karpathy GPU Authority Blend

Generated: 2026-06-05T02:38:16.421Z

- FP16 mode: auto (default)
- FP32 compare: false
- GPU addon loaded: true
- GPU attention used: true

| File | PR | Auth | Attn | CPU | GPU | Δ | Peak | Mean | Blend |
|---|---|---|---|---|---|---|---|---|---|
| src/lib/server/db/client.ts | 7.062 | 10702.526 | 0.022 | 0.633 | 0.022 | -0.611 | 0.022 | 0.022 | 3213.589 |
| src/lib/server/ollama.ts | 3.413 | 5299.567 | 0.022 | 0.572 | 0.022 | -0.549 | 0.022 | 0.022 | 1591.242 |
| src/lib/server/grpc/embedding-client.ts | 1.851 | 1087.117 | 0.022 | 0.618 | 0.022 | -0.596 | 0.022 | 0.022 | 326.882 |
| src/lib/server/vector/qdrant-manager.ts | 1.809 | 313.317 | 0.022 | 0.572 | 0.022 | -0.549 | 0.022 | 0.022 | 94.725 |
| src/lib/server/db/schema-postgres.ts | 4.050 | 249.917 | 0.022 | 0.632 | 0.022 | -0.610 | 0.022 | 0.022 | 76.602 |
| src/lib/server/redis.ts | 3.904 | 73.950 | 0.022 | 0.595 | 0.022 | -0.573 | 0.022 | 0.022 | 23.753 |
| src/lib/server/lucia.ts | 1.778 | 75.833 | 0.000 | 0.000 | 0.022 | 0.022 | 0.022 | 0.022 | 23.461 |
| src/lib/server/cache.ts | 1.899 | 69.533 | 0.022 | 0.637 | 0.022 | -0.615 | 0.022 | 0.022 | 21.626 |
| src/lib/config/env.server.ts | 2.715 | 61.000 | 0.022 | 0.634 | 0.022 | -0.612 | 0.022 | 0.022 | 19.392 |
| src/lib/server/observability/langfuse.ts | 2.453 | 11.200 | 0.022 | 0.590 | 0.022 | -0.568 | 0.022 | 0.022 | 4.348 |
| src/lib/server/embeddings/ollama.ts | 1.675 | 11.167 | 0.022 | 0.582 | 0.022 | -0.560 | 0.022 | 0.022 | 4.027 |
| src/lib/server/db/schema/legal-nodes.ts | 1.676 | 10.000 | 0.022 | 0.628 | 0.022 | -0.605 | 0.022 | 0.022 | 3.677 |
| src/lib/server/db/schema/library-documents.ts | 1.796 | 9.000 | 0.022 | 0.642 | 0.022 | -0.620 | 0.022 | 0.022 | 3.425 |
| src/lib/server/minio-client.ts | 1.834 | 7.583 | 0.022 | 0.584 | 0.022 | -0.562 | 0.022 | 0.022 | 3.015 |
| src/lib/server/analysis/worker.ts | 1.903 | 5.000 | 0.022 | 0.623 | 0.022 | -0.601 | 0.022 | 0.022 | 2.268 |
| src/lib/server/env.server.ts | 5.278 | 0.000 | 0.022 | 0.642 | 0.022 | -0.619 | 0.022 | 0.022 | 2.118 |
| src/lib/server/db/schema-evidence-crud.ts | 1.760 | 2.000 | 0.022 | 0.614 | 0.022 | -0.592 | 0.022 | 0.022 | 1.311 |
| src/lib/server/middleware/cache-headers.ts | 3.173 | 0.000 | 0.022 | 0.624 | 0.022 | -0.601 | 0.022 | 0.022 | 1.276 |
| src/lib/cache/cache-service.svelte.ts | 1.641 | 2.000 | 0.022 | 0.621 | 0.022 | -0.598 | 0.022 | 0.022 | 1.263 |
| src/lib/server/observability/inference-log.ts | 2.130 | 1.033 | 0.022 | 0.606 | 0.022 | -0.584 | 0.022 | 0.022 | 1.169 |
| src/lib/server/minio.ts | 1.640 | 1.000 | 0.022 | 0.592 | 0.022 | -0.570 | 0.022 | 0.022 | 0.962 |
| src/lib/server/gpu/simdjson-bridge.ts | 1.852 | 0.000 | 0.022 | 0.617 | 0.022 | -0.595 | 0.022 | 0.022 | 0.747 |
| src/lib/server/neo4j-driver.ts | 1.837 | 0.000 | 0.022 | 0.636 | 0.022 | -0.614 | 0.022 | 0.022 | 0.741 |
| src/lib/server/db/relations.ts | 1.835 | 0.000 | 0.022 | 0.647 | 0.022 | -0.624 | 0.022 | 0.022 | 0.741 |
| src/lib/server/gpu/libtorch-bridge.ts | 1.787 | 0.000 | 0.022 | 0.591 | 0.022 | -0.569 | 0.022 | 0.022 | 0.722 |
