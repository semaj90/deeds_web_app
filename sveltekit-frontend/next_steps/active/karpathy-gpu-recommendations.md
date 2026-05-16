# Karpathy GPU Authority Blend — Recommendations

> Run: 2026-05-16T01:41:28.287Z
> Mode: `topN` · candidates: 94 · embedded: 18 · skipped: 76
> GPU: encode=true · attention=false

## Top 20 by Composite Authority Score

Composite = 0.4·PageRank + 0.3·AttentionScore + 0.3·GraphAuthority

| Rank | File | PageRank | Attention | Authority | Blend | Community |
|------|------|----------|-----------|-----------|-------|-----------|
| 1 | `src/lib/server/db/client.ts` | 7.062 | 0.000 | 0.555 | **2.991** | 1305 |
| 2 | `src/lib/server/env.server.ts` | 5.278 | 0.000 | 0.374 | **2.223** | 1836 |
| 3 | `src/lib/server/redis.ts` | 3.904 | 0.000 | 0.306 | **1.653** | 1305 |
| 4 | `src/lib/server/ollama.ts` | 3.413 | 0.000 | 0.324 | **1.463** | 1305 |
| 5 | `src/lib/config/env.server.ts` | 2.715 | 0.000 | 0.197 | **1.145** | 1305 |
| 6 | `src/lib/server/db/relations.ts` | 1.835 | 0.000 | 0.253 | **0.810** | 1836 |
| 7 | `src/lib/server/grpc/embedding-client.ts` | 1.851 | 0.000 | 0.216 | **0.805** | 1910 |
| 8 | `src/lib/server/minio-client.ts` | 1.834 | 0.000 | 0.203 | **0.794** | 1305 |
| 9 | `src/lib/server/gpu/libtorch-bridge.ts` | 1.787 | 0.000 | 0.207 | **0.777** | 1305 |
| 10 | `src/lib/cache/cache-service.svelte.ts` | 1.641 | 0.000 | 0.150 | **0.701** | 1305 |
| 11 | `src/routes/api/analytics/research-graph/+server.ts` | 1.583 | 0.000 | 0.209 | **0.696** | 1251 |
| 12 | `src/lib/server/ai/langgraph-client.ts` | 1.597 | 0.000 | 0.185 | **0.694** | 1305 |
| 13 | `src/lib/server/queue/rabbitmq-manager-fixed.ts` | 1.562 | 0.000 | 0.202 | **0.685** | 1305 |
| 14 | `src/lib/client/ui/POIPhotoUploader.svelte` | 1.604 | 0.000 | 0.130 | **0.681** | 1434 |
| 15 | `src/lib/ai/client-embed.ts` | 1.586 | 0.000 | 0.147 | **0.678** | 1305 |
| 16 | `src/lib/server/cache-keys.ts` | 1.542 | 0.000 | 0.189 | **0.673** | 1836 |
| 17 | `src/lib/ai/model-ids.ts` | 1.560 | 0.000 | 0.127 | **0.662** | 1836 |
| 18 | `src/lib/config/redis-config.ts` | 1.551 | 0.000 | 0.133 | **0.660** | 1305 |

## Recommended Actions

- **Top 5 by blend** are highest-leverage refactor/audit targets — touching them ripples broadly.
- **High attention + low authority** = hub files that the graph hasn't fully recognized yet (likely under-imported helpers).
- **High PageRank + low attention** = structurally central but semantically isolated (good for documentation pass).
- **Same community + high blend** = co-evolving cluster — good candidate for a single PR scope.

## Verification

```bash
redis-cli HGET gpu:karpathy:summary runAt
redis-cli HGET gpu:karpathy:scores 'src/lib/server/db/client.ts'
npm run karpathy:gpu:dirty   # incremental refresh on dirty files only
```
