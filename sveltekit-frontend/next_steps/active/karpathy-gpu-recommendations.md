# Karpathy GPU Authority Blend — Recommendations

> Run: 2026-05-08T07:10:09.400Z
> Mode: `topN` · candidates: 50 · embedded: 48 · skipped: 2
> GPU: encode=true · attention=true

## Top 20 by Composite Authority Score

Composite = 0.4·PageRank + 0.3·AttentionScore + 0.3·GraphAuthority

| Rank | File | PageRank | Attention | Authority | Blend | Community |
|------|------|----------|-----------|-----------|-------|-----------|
| 1 | `src/lib/server/db/client.ts` | 7.062 | 0.785 | 0.555 | **3.227** | 649 |
| 2 | `src/lib/server/env.server.ts` | 5.278 | 0.270 | 0.374 | **2.304** | 494 |
| 3 | `src/lib/server/redis.ts` | 3.904 | 0.280 | 0.306 | **1.737** | 649 |
| 4 | `src/lib/server/ollama.ts` | 3.413 | 0.423 | 0.324 | **1.590** | 690 |
| 5 | `src/lib/server/middleware/cache-headers.ts` | 3.173 | 0.079 | 0.257 | **1.370** | 649 |
| 6 | `src/lib/config/env.server.ts` | 2.715 | 0.251 | 0.197 | **1.220** | 649 |
| 7 | `src/lib/server/observability/langfuse.ts` | 2.453 | 0.366 | 0.228 | **1.160** | 649 |
| 8 | `src/lib/server/db/relations.ts` | 1.835 | 0.911 | 0.253 | **1.083** | 494 |
| 9 | `src/lib/server/analysis/worker.ts` | 1.903 | 0.846 | 0.206 | **1.077** | 649 |
| 10 | `src/lib/server/neo4j-driver.ts` | 1.837 | 0.918 | 0.203 | **1.071** | 649 |
| 11 | `src/lib/server/observability/inference-log.ts` | 2.130 | 0.392 | 0.212 | **1.033** | 649 |
| 12 | `src/lib/server/db/schema/legal-citations.ts` | 1.782 | 0.801 | 0.257 | **1.030** | 494 |
| 13 | `src/lib/server/gpu/simdjson-bridge.ts` | 1.852 | 0.723 | 0.210 | **1.021** | 649 |
| 14 | `src/lib/server/db/schema/legal-nodes.ts` | 1.676 | 0.908 | 0.258 | **1.020** | 494 |
| 15 | `src/lib/db/schema/cutlass.ts` | 1.647 | 0.964 | 0.138 | **0.989** | 494 |
| 16 | `src/lib/server/validation.ts` | 1.631 | 0.922 | 0.181 | **0.983** | 649 |
| 17 | `src/lib/server/db/schema/library-documents.ts` | 1.796 | 0.602 | 0.257 | **0.976** | 494 |
| 18 | `src/routes/api/analytics/research-graph/+server.ts` | 1.583 | 0.903 | 0.209 | **0.967** | 728 |
| 19 | `src/routes/api/test/redis-direct/+server.ts` | 1.779 | 0.463 | 0.356 | **0.957** | 649 |
| 20 | `src/lib/server/db/schema/case-library-links.ts` | 1.600 | 0.785 | 0.266 | **0.955** | 494 |

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
