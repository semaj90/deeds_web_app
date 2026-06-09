# Karpathy GPU Authority Blend

Generated: 2026-06-09T23:23:14.004Z

- FP16 mode: auto (default)
- FP32 compare: false
- GPU addon loaded: true
- GPU attention used: true

| File | PR | Auth | Attn | CPU | GPU | Δ | Peak | Mean | Blend |
|---|---|---|---|---|---|---|---|---|---|
| src/lib/server/db/client.ts | 7.062 | 10702.526 | 0.004 | 0.633 | 0.004 | -0.629 | 0.004 | 0.004 | 0.701 |
| src/lib/server/ai/hermes/skills/registry.ts | 6.464 | 0.000 | 0.000 | 0.000 | 0.004 | 0.004 | 0.004 | 0.004 | 0.360 |
| src/lib/server/ollama.ts | 3.413 | 5299.567 | 0.004 | 0.572 | 0.004 | -0.567 | 0.004 | 0.004 | 0.306 |
| src/lib/server/env.server.ts | 5.278 | 0.000 | 0.004 | 0.642 | 0.004 | -0.637 | 0.004 | 0.004 | 0.282 |
| src/lib/server/db/schema-postgres.ts | 4.050 | 249.917 | 0.004 | 0.632 | 0.004 | -0.628 | 0.004 | 0.004 | 0.207 |
| src/lib/server/redis.ts | 3.904 | 73.950 | 0.004 | 0.595 | 0.004 | -0.591 | 0.004 | 0.004 | 0.193 |
| src/lib/server/middleware/cache-headers.ts | 3.173 | 0.000 | 0.004 | 0.624 | 0.004 | -0.619 | 0.004 | 0.004 | 0.142 |
| scripts/atlas/_atlas-utils.mjs | 3.000 | 0.149 | 0.000 | 0.000 | 0.004 | 0.004 | 0.004 | 0.004 | 0.129 |
| src/lib/config/env.server.ts | 2.715 | 61.000 | 0.004 | 0.634 | 0.004 | -0.630 | 0.004 | 0.004 | 0.113 |
| src/lib/server/observability/langfuse.ts | 2.453 | 11.200 | 0.004 | 0.590 | 0.004 | -0.585 | 0.004 | 0.004 | 0.094 |
| src/lib/server/grpc/embedding-client.ts | 1.851 | 1087.117 | 0.004 | 0.618 | 0.004 | -0.613 | 0.004 | 0.004 | 0.084 |
| src/lib/server/observability/inference-log.ts | 2.130 | 1.033 | 0.004 | 0.606 | 0.004 | -0.601 | 0.004 | 0.004 | 0.072 |
| src/lib/server/vector/qdrant-manager.ts | 1.809 | 313.317 | 0.004 | 0.572 | 0.004 | -0.567 | 0.004 | 0.004 | 0.059 |
| src/lib/server/cache.ts | 1.899 | 69.533 | 0.004 | 0.637 | 0.004 | -0.633 | 0.004 | 0.004 | 0.059 |
| src/lib/server/analysis/worker.ts | 1.903 | 5.000 | 0.004 | 0.623 | 0.004 | -0.619 | 0.004 | 0.004 | 0.057 |
| src/lib/server/gpu/simdjson-bridge.ts | 1.852 | 0.000 | 0.004 | 0.617 | 0.004 | -0.613 | 0.004 | 0.004 | 0.054 |
| src/lib/server/neo4j-driver.ts | 1.837 | 0.000 | 0.004 | 0.636 | 0.004 | -0.631 | 0.004 | 0.004 | 0.053 |
| src/lib/server/minio-client.ts | 1.834 | 7.583 | 0.004 | 0.584 | 0.004 | -0.580 | 0.004 | 0.004 | 0.053 |
| src/lib/server/db/relations.ts | 1.835 | 0.000 | 0.004 | 0.647 | 0.004 | -0.642 | 0.004 | 0.004 | 0.052 |
| src/lib/server/services/error-analysis/types.ts | 1.825 | 0.000 | 0.004 | 0.635 | 0.004 | -0.630 | 0.004 | 0.004 | 0.052 |
| src/lib/server/lucia.ts | 1.778 | 75.833 | 0.004 | 0.635 | 0.004 | -0.631 | 0.004 | 0.004 | 0.051 |
| src/lib/server/db/schema/library-documents.ts | 1.796 | 9.000 | 0.004 | 0.642 | 0.004 | -0.638 | 0.004 | 0.004 | 0.050 |
| src/lib/server/agents/agents-card-store.ts | 1.798 | 0.000 | 0.004 | 0.613 | 0.004 | -0.608 | 0.004 | 0.004 | 0.050 |
| src/lib/server/gpu/libtorch-bridge.ts | 1.787 | 0.000 | 0.004 | 0.591 | 0.004 | -0.586 | 0.004 | 0.004 | 0.049 |
| src/routes/api/test/redis-direct/+server.ts | 1.779 | 0.000 | 0.004 | 0.605 | 0.004 | -0.600 | 0.004 | 0.004 | 0.049 |
