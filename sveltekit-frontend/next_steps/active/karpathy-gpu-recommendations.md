# Karpathy GPU Authority Blend — Recommendations

> Run: 2026-05-11T03:28:43.283Z
> Mode: `topN` · candidates: 44 · embedded: 9 · skipped: 35
> GPU: encode=true · attention=true

## Top 20 by Composite Authority Score

Composite = 0.4·PageRank + 0.3·AttentionScore + 0.3·GraphAuthority

| Rank | File | PageRank | Attention | Authority | Blend | Community |
|------|------|----------|-----------|-----------|-------|-----------|
| 1 | `src/lib/server/db/client.ts` | 7.062 | 0.747 | 0.555 | **3.215** | 1305 |
| 2 | `src/lib/server/env.server.ts` | 5.278 | 0.510 | 0.374 | **2.376** | 608 |
| 3 | `src/lib/server/redis.ts` | 3.904 | 0.110 | 0.306 | **1.686** | 1305 |
| 4 | `src/lib/server/ollama.ts` | 3.413 | 0.623 | 0.324 | **1.649** | 1305 |
| 5 | `src/lib/config/env.server.ts` | 2.715 | 0.431 | 0.197 | **1.274** | 1305 |
| 6 | `src/lib/server/db/relations.ts` | 1.835 | 0.926 | 0.253 | **1.087** | 608 |
| 7 | `src/lib/server/grpc/embedding-client.ts` | 1.851 | 0.671 | 0.216 | **1.006** | 1910 |
| 8 | `src/lib/server/ai/langgraph-client.ts` | 1.597 | 0.560 | 0.185 | **0.862** | 1305 |
| 9 | `src/lib/server/gpu/libtorch-bridge.ts` | 1.787 | 0.061 | 0.207 | **0.795** | 1305 |

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
