# Karpathy GPU Authority Blend — Recommendations

> Run: 2026-05-09T22:35:21.173Z
> Mode: `topN` · candidates: 50 · embedded: 48 · skipped: 2
> GPU: encode=true · attention=true

## Top 20 by Composite Authority Score

Composite = 0.4·PageRank + 0.3·AttentionScore + 0.3·GraphAuthority

| Rank | File | PageRank | Attention | Authority | Blend | Community |
|------|------|----------|-----------|-----------|-------|-----------|
| 1 | `src/lib/server/db/client.ts` | 7.062 | 0.784 | 0.555 | **3.226** | community:199 |
| 2 | `src/lib/server/env.server.ts` | 5.278 | 0.458 | 0.374 | **2.361** | community:494 |
| 3 | `src/lib/server/redis.ts` | 3.904 | 0.276 | 0.306 | **1.736** | community:199 |
| 4 | `src/lib/server/ollama.ts` | 3.413 | 0.419 | 0.324 | **1.588** | community:690 |
| 5 | `src/lib/server/middleware/cache-headers.ts` | 3.173 | 0.077 | 0.257 | **1.369** | community:199 |
| 6 | `src/lib/config/env.server.ts` | 2.715 | 0.248 | 0.197 | **1.219** | community:199 |
| 7 | `src/lib/server/observability/langfuse.ts` | 2.453 | 0.362 | 0.228 | **1.158** | community:199 |
| 8 | `src/lib/server/db/relations.ts` | 1.835 | 0.911 | 0.253 | **1.083** | community:494 |
| 9 | `src/lib/server/analysis/worker.ts` | 1.903 | 0.845 | 0.206 | **1.077** | community:199 |
| 10 | `src/lib/server/neo4j-driver.ts` | 1.837 | 0.917 | 0.203 | **1.071** | community:199 |
| 11 | `src/lib/server/observability/inference-log.ts` | 2.130 | 0.388 | 0.212 | **1.032** | community:199 |
| 12 | `src/lib/server/db/schema/legal-citations.ts` | 1.782 | 0.799 | 0.257 | **1.030** | community:494 |
| 13 | `src/lib/server/gpu/simdjson-bridge.ts` | 1.852 | 0.721 | 0.210 | **1.020** | community:199 |
| 14 | `src/lib/server/db/schema/legal-nodes.ts` | 1.676 | 0.907 | 0.258 | **1.020** | community:494 |
| 15 | `src/lib/db/schema/cutlass.ts` | 1.647 | 0.964 | 0.138 | **0.989** | community:494 |
| 16 | `src/lib/server/validation.ts` | 1.631 | 0.921 | 0.181 | **0.983** | community:199 |
| 17 | `src/lib/server/db/schema/library-documents.ts` | 1.796 | 0.599 | 0.257 | **0.975** | community:494 |
| 18 | `src/routes/api/analytics/research-graph/+server.ts` | 1.583 | 0.903 | 0.209 | **0.967** | community:500 |
| 19 | `src/routes/api/test/redis-direct/+server.ts` | 1.779 | 0.459 | 0.356 | **0.956** | community:199 |
| 20 | `src/lib/server/db/schema/case-library-links.ts` | 1.600 | 0.784 | 0.266 | **0.955** | community:494 |

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
