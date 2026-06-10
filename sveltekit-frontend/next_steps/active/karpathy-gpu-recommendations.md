# Karpathy GPU Authority Blend

Generated: 2026-06-10T16:37:44.504Z

- FP16 mode: auto (default)
- FP32 compare: false
- GPU addon loaded: true
- GPU attention used: true

| File | PR | Auth | Attn | CPU | GPU | Δ | Peak | Mean | Blend |
|---|---|---|---|---|---|---|---|---|---|
| src/lib/server/db/client.ts | 7.062 | 10702.526 | 0.006 | 0.633 | 0.006 | -0.628 | 0.006 | 0.006 | 0.702 |
| src/lib/server/ai/hermes/skills/registry.ts | 6.464 | 0.000 | 0.000 | 0.000 | 0.006 | 0.006 | 0.006 | 0.006 | 0.359 |
| src/lib/server/ollama.ts | 3.413 | 5299.567 | 0.006 | 0.572 | 0.006 | -0.566 | 0.006 | 0.006 | 0.300 |
| src/lib/server/env.server.ts | 5.278 | 0.000 | 0.006 | 0.642 | 0.006 | -0.636 | 0.006 | 0.006 | 0.279 |
| src/lib/server/db/schema-postgres.ts | 4.050 | 249.917 | 0.006 | 0.632 | 0.006 | -0.626 | 0.006 | 0.006 | 0.202 |
| src/lib/server/redis.ts | 3.904 | 73.950 | 0.006 | 0.595 | 0.006 | -0.590 | 0.006 | 0.006 | 0.187 |
| src/lib/server/middleware/cache-headers.ts | 3.173 | 0.000 | 0.006 | 0.624 | 0.006 | -0.618 | 0.006 | 0.006 | 0.134 |
| scripts/atlas/_atlas-utils.mjs | 3.000 | 0.149 | 0.000 | 0.000 | 0.006 | 0.006 | 0.006 | 0.006 | 0.121 |
| src/lib/config/env.server.ts | 2.715 | 61.000 | 0.006 | 0.634 | 0.006 | -0.629 | 0.006 | 0.006 | 0.105 |
| src/lib/server/observability/langfuse.ts | 2.453 | 11.200 | 0.006 | 0.590 | 0.006 | -0.584 | 0.006 | 0.006 | 0.085 |
| src/lib/server/grpc/embedding-client.ts | 1.851 | 1087.117 | 0.006 | 0.618 | 0.006 | -0.612 | 0.006 | 0.006 | 0.074 |
| src/lib/server/observability/inference-log.ts | 2.130 | 1.033 | 0.006 | 0.606 | 0.006 | -0.600 | 0.006 | 0.006 | 0.063 |
| src/lib/server/vector/qdrant-manager.ts | 1.809 | 313.317 | 0.006 | 0.572 | 0.006 | -0.566 | 0.006 | 0.006 | 0.050 |
| src/lib/server/cache.ts | 1.899 | 69.533 | 0.006 | 0.637 | 0.006 | -0.632 | 0.006 | 0.006 | 0.049 |
| src/lib/server/analysis/worker.ts | 1.903 | 5.000 | 0.006 | 0.623 | 0.006 | -0.617 | 0.006 | 0.006 | 0.047 |
| src/lib/server/gpu/simdjson-bridge.ts | 1.852 | 0.000 | 0.006 | 0.617 | 0.006 | -0.611 | 0.006 | 0.006 | 0.044 |
| src/lib/server/neo4j-driver.ts | 1.837 | 0.000 | 0.006 | 0.636 | 0.006 | -0.630 | 0.006 | 0.006 | 0.043 |
| src/lib/server/minio-client.ts | 1.834 | 7.583 | 0.006 | 0.584 | 0.006 | -0.579 | 0.006 | 0.006 | 0.043 |
| src/lib/server/db/relations.ts | 1.835 | 0.000 | 0.006 | 0.647 | 0.006 | -0.641 | 0.006 | 0.006 | 0.043 |
| src/lib/server/services/error-analysis/types.ts | 1.825 | 0.000 | 0.006 | 0.635 | 0.006 | -0.629 | 0.006 | 0.006 | 0.042 |
| src/lib/server/lucia.ts | 1.778 | 75.833 | 0.006 | 0.635 | 0.006 | -0.630 | 0.006 | 0.006 | 0.041 |
| src/lib/server/db/schema/library-documents.ts | 1.796 | 9.000 | 0.006 | 0.642 | 0.006 | -0.636 | 0.006 | 0.006 | 0.040 |
| src/lib/server/agents/agents-card-store.ts | 1.798 | 0.000 | 0.006 | 0.613 | 0.006 | -0.607 | 0.006 | 0.006 | 0.040 |
| src/lib/server/gpu/libtorch-bridge.ts | 1.787 | 0.000 | 0.006 | 0.591 | 0.006 | -0.585 | 0.006 | 0.006 | 0.039 |
| src/routes/api/test/redis-direct/+server.ts | 1.779 | 0.000 | 0.006 | 0.605 | 0.006 | -0.599 | 0.006 | 0.006 | 0.039 |
