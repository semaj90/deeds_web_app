# Karpathy GPU Authority Blend

Generated: 2026-06-07T05:47:52.298Z

- FP16 mode: auto (default)
- FP32 compare: false
- GPU addon loaded: true
- GPU attention used: true

| File | PR | Auth | Attn | CPU | GPU | Δ | Peak | Mean | Blend |
|---|---|---|---|---|---|---|---|---|---|
| src/lib/server/db/client.ts | 7.062 | 10702.526 | 0.020 | 0.633 | 0.020 | -0.613 | 0.020 | 0.020 | 3213.589 |
| src/lib/server/ollama.ts | 3.413 | 5299.567 | 0.020 | 0.572 | 0.020 | -0.552 | 0.020 | 0.020 | 1591.241 |
| src/lib/server/grpc/embedding-client.ts | 1.851 | 1087.117 | 0.020 | 0.618 | 0.020 | -0.598 | 0.020 | 0.020 | 326.881 |
| src/lib/server/vector/qdrant-manager.ts | 1.809 | 313.317 | 0.020 | 0.572 | 0.020 | -0.552 | 0.020 | 0.020 | 94.724 |
| src/lib/server/db/schema-postgres.ts | 4.050 | 249.917 | 0.020 | 0.632 | 0.020 | -0.612 | 0.020 | 0.020 | 76.601 |
| src/lib/server/redis.ts | 3.904 | 73.950 | 0.020 | 0.595 | 0.020 | -0.575 | 0.020 | 0.020 | 23.752 |
| src/lib/server/lucia.ts | 1.778 | 75.833 | 0.020 | 0.635 | 0.020 | -0.615 | 0.020 | 0.020 | 23.467 |
| src/lib/server/cache.ts | 1.899 | 69.533 | 0.020 | 0.637 | 0.020 | -0.617 | 0.020 | 0.020 | 21.626 |
| src/lib/config/env.server.ts | 2.715 | 61.000 | 0.020 | 0.635 | 0.020 | -0.614 | 0.020 | 0.020 | 19.392 |
| src/lib/server/observability/langfuse.ts | 2.453 | 11.200 | 0.020 | 0.590 | 0.020 | -0.570 | 0.020 | 0.020 | 4.347 |
| src/lib/server/db/schema/library-documents.ts | 1.796 | 9.000 | 0.020 | 0.642 | 0.020 | -0.622 | 0.020 | 0.020 | 3.425 |
| src/lib/server/minio-client.ts | 1.834 | 7.583 | 0.020 | 0.584 | 0.020 | -0.564 | 0.020 | 0.020 | 3.014 |
| sveltekit-frontend/src/lib/server/ai/hermes/skills/registry.ts | 6.464 | 0.000 | 0.020 | 0.615 | 0.020 | -0.595 | 0.020 | 0.020 | 2.592 |
| src/lib/server/analysis/worker.ts | 1.903 | 5.000 | 0.020 | 0.623 | 0.020 | -0.603 | 0.020 | 0.020 | 2.267 |
| src/lib/server/env.server.ts | 5.278 | 0.000 | 0.020 | 0.642 | 0.020 | -0.622 | 0.020 | 0.020 | 2.117 |
| src/lib/server/db/schema-evidence-crud.ts | 1.760 | 2.000 | 0.020 | 0.614 | 0.020 | -0.594 | 0.020 | 0.020 | 1.310 |
| src/lib/server/middleware/cache-headers.ts | 3.173 | 0.000 | 0.020 | 0.624 | 0.020 | -0.604 | 0.020 | 0.020 | 1.275 |
| scripts/atlas/_atlas-utils.mjs | 3.000 | 0.000 | 0.000 | 0.000 | 0.020 | 0.020 | 0.020 | 0.020 | 1.200 |
| src/lib/server/observability/inference-log.ts | 2.130 | 1.033 | 0.020 | 0.606 | 0.020 | -0.586 | 0.020 | 0.020 | 1.168 |
| scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/error-brain/recommend/+server.ts | 2.153 | 0.000 | 0.000 | 0.000 | 0.020 | 0.020 | 0.020 | 0.020 | 0.861 |
| scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/test-unified-db/+server.ts | 2.143 | 0.000 | 0.000 | 0.000 | 0.020 | 0.020 | 0.020 | 0.020 | 0.857 |
| scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/crud/+server.ts | 2.142 | 0.000 | 0.000 | 0.000 | 0.020 | 0.020 | 0.020 | 0.020 | 0.857 |
| scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/health/database/+server.ts | 2.137 | 0.000 | 0.000 | 0.000 | 0.020 | 0.020 | 0.020 | 0.020 | 0.855 |
| scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/dev-auth/+server.ts | 2.111 | 0.000 | 0.000 | 0.000 | 0.020 | 0.020 | 0.020 | 0.020 | 0.845 |
| scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/reports/+server.ts | 2.104 | 0.000 | 0.000 | 0.000 | 0.020 | 0.020 | 0.020 | 0.020 | 0.842 |
