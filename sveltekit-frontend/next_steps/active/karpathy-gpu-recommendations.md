# Karpathy GPU Authority Blend

Generated: 2026-06-01T22:46:21.879Z

- FP16 mode: auto (default)
- FP32 compare: false
- GPU addon loaded: true
- GPU attention used: true

| File | PR | Auth | Attn | CPU | GPU | Δ | Peak | Mean | Blend |
|---|---|---|---|---|---|---|---|---|---|
| src/lib/server/db/schema.ts | 7.624 | 12749.400 | 0.020 | 0.660 | 0.020 | -0.640 | 0.020 | 0.020 | 3827.876 |
| src/lib/server/db/client.ts | 21.134 | 10702.526 | 0.020 | 0.505 | 0.020 | -0.485 | 0.020 | 0.020 | 3219.218 |
| src/lib/server/ollama.ts | 7.452 | 5299.567 | 0.020 | 0.566 | 0.020 | -0.546 | 0.020 | 0.020 | 1592.857 |
| src/lib/server/ai/hypergraph-store.ts | 1.279 | 4234.383 | 0.020 | 0.502 | 0.020 | -0.482 | 0.020 | 0.020 | 1270.833 |
| src/lib/server/grpc/embedding-client.ts | 1.474 | 1087.117 | 0.020 | 0.618 | 0.020 | -0.598 | 0.020 | 0.020 | 326.731 |
| src/lib/server/db/schema-canvas-autosaves.ts | 3.743 | 630.017 | 0.020 | 0.635 | 0.020 | -0.615 | 0.020 | 0.020 | 190.508 |
| src/lib/server/research/web-research-ingester.ts | 0.988 | 555.500 | 0.020 | 0.591 | 0.020 | -0.571 | 0.020 | 0.020 | 167.051 |
| src/lib/server/db/drizzle-cache.ts | 3.743 | 386.393 | 0.020 | 0.514 | 0.020 | -0.494 | 0.020 | 0.020 | 117.421 |
| src/lib/server/db/schema-postgres.ts | 54.810 | 249.917 | 0.000 | 0.000 | 0.020 | 0.020 | 0.020 | 0.020 | 96.899 |
| src/lib/server/vector/qdrant-manager.ts | 1.343 | 313.317 | 0.000 | 0.000 | 0.020 | 0.020 | 0.020 | 0.020 | 94.532 |
| src/lib/server/analytics/search-analytics.ts | 0.760 | 147.393 | 0.020 | 0.486 | 0.020 | -0.467 | 0.020 | 0.020 | 44.528 |
| src/lib/types/enhanced-svelte5-types.ts | 3.397 | 133.967 | 0.000 | 0.000 | 0.020 | 0.020 | 0.020 | 0.020 | 41.549 |
| src/lib/server/redis.ts | 13.009 | 73.950 | 0.020 | 0.599 | 0.020 | -0.579 | 0.020 | 0.020 | 27.394 |
| src/lib/server/cache.ts | 0.757 | 69.533 | 0.020 | 0.505 | 0.020 | -0.486 | 0.020 | 0.020 | 21.169 |
| src/lib/config/env.server.ts | 4.362 | 61.000 | 0.020 | 0.505 | 0.020 | -0.485 | 0.020 | 0.020 | 20.051 |
| src/lib/server/db/schema-chat.ts | 47.054 | 0.000 | 0.020 | 0.622 | 0.020 | -0.602 | 0.020 | 0.020 | 18.828 |
| src/lib/server/env.server.ts | 41.220 | 0.000 | 0.020 | 0.641 | 0.020 | -0.621 | 0.020 | 0.020 | 16.494 |
| src/lib/server/queue/rabbitmq-manager-fixed.ts | 0.818 | 21.333 | 0.020 | 0.600 | 0.020 | -0.580 | 0.020 | 0.020 | 6.733 |
| src/lib/server/observability/langfuse.ts | 8.347 | 11.200 | 0.020 | 0.592 | 0.020 | -0.572 | 0.020 | 0.020 | 6.705 |
| src/lib/server/cache/redis-exact-match.ts | 0.796 | 18.000 | 0.020 | 0.495 | 0.020 | -0.475 | 0.020 | 0.020 | 5.724 |
| src/lib/server/db/schema/library-documents.ts | 3.753 | 9.000 | 0.020 | 0.642 | 0.020 | -0.622 | 0.020 | 0.020 | 4.207 |
| src/lib/server/db/schema/legal-nodes.ts | 1.868 | 10.000 | 0.020 | 0.628 | 0.020 | -0.607 | 0.020 | 0.020 | 3.753 |
| src/lib/server/minio-client.ts | 0.777 | 7.583 | 0.020 | 0.586 | 0.020 | -0.566 | 0.020 | 0.020 | 2.592 |
| src/lib/server/cache-keys.ts | 0.876 | 6.667 | 0.020 | 0.471 | 0.020 | -0.451 | 0.020 | 0.020 | 2.356 |
| src/lib/server/middleware/cache-headers.ts | 4.225 | 0.000 | 0.020 | 0.622 | 0.020 | -0.602 | 0.020 | 0.020 | 1.696 |
