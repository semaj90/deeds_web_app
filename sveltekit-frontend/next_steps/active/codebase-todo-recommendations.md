# Codebase TODO Recommendations
> Generated: 2026-05-08T04:34:36Z | Top-25 by fused authority + Karpathy GPU + dirty-file signal
> Sources: Redis ace:authority:top + gpu:karpathy:scores + ace:rank:dirty_files,
>          Postgres agent_context_files, MCP clusters.get_summary_lenses,
>          docs/agent_timeline_synthesis.md
## (Gemma4 rerank skipped or unavailable)

## Ranked Targets
| # | File | Blend | PR | Authority | Attention | Dirty | Reasons |
|---|------|-------|----|-----------|-----------|-------|---------|
| 1 | `src/lib/server/db/client.ts` | 0.510 | 0.00 | 0.55 | 0.00 | · | authority=0.55 |
| 2 | `src/lib/server/env.server.ts` | 0.370 | 0.00 | 0.37 | 0.00 | · | — |
| 3 | `src/lib/server/redis.ts` | 0.311 | 0.15 | 0.35 | 0.00 | · | unclassified:community-2516 |
| 4 | `src/lib/server/ollama.ts` | 0.284 | 0.00 | 0.32 | 0.00 | · | — |
| 5 | `src/lib/server/middleware/cache-headers.ts` | 0.247 | 0.00 | 0.26 | 0.00 | · | — |
| 6 | `src/routes/api/test/redis-direct/+server.ts` | 0.240 | 0.00 | 0.36 | 0.00 | · | — |
| 7 | `src/lib/server/grpc/embedding-client.ts` | 0.237 | 0.15 | 0.35 | 0.00 | · | unclassified:community-2493 |
| 8 | `src/lib/server/gpu/libtorch-bridge.ts` | 0.234 | 0.15 | 0.35 | 0.00 | · | unclassified:community-2475 |
| 9 | `src/lib/server/vector/qdrant-manager.ts` | 0.212 | 0.00 | 0.29 | 0.00 | · | — |
| 10 | `src/lib/server/observability/langfuse.ts` | 0.209 | 0.00 | 0.23 | 0.00 | · | — |
| 11 | `src/lib/config/env.server.ts` | 0.205 | 0.00 | 0.20 | 0.00 | · | — |
| 12 | `src/lib/server/db/utils.ts` | 0.201 | 0.00 | 0.27 | 0.00 | · | — |
| 13 | `src/lib/server/db/schema/library-documents.ts` | 0.199 | 0.00 | 0.26 | 0.00 | · | — |
| 14 | `src/lib/server/db/relations.ts` | 0.198 | 0.00 | 0.25 | 0.00 | · | — |
| 15 | `src/lib/server/db/schema/legal-citations.ts` | 0.198 | 0.00 | 0.26 | 0.00 | · | — |
| 16 | `src/lib/server/db/schema-evidence-crud.ts` | 0.197 | 0.00 | 0.26 | 0.00 | · | — |
| 17 | `src/lib/server/observability/inference-log.ts` | 0.191 | 0.00 | 0.21 | 0.00 | · | — |
| 18 | `src/lib/server/cache.ts` | 0.188 | 0.00 | 0.22 | 0.00 | · | — |
| 19 | `src/lib/server/lucia.ts` | 0.184 | 0.00 | 0.22 | 0.00 | · | — |
| 20 | `src/lib/server/analysis/worker.ts` | 0.181 | 0.00 | 0.21 | 0.00 | · | — |
| 21 | `src/lib/server/gpu/simdjson-bridge.ts` | 0.181 | 0.00 | 0.21 | 0.00 | · | — |
| 22 | `src/lib/server/neo4j-driver.ts` | 0.177 | 0.00 | 0.20 | 0.00 | · | — |
| 23 | `src/lib/server/minio-client.ts` | 0.177 | 0.00 | 0.20 | 0.00 | · | — |
| 24 | `src/lib/server/retrieval/context-buffer.ts` | 0.171 | 0.00 | 0.20 | 0.00 | · | — |
| 25 | `lib/server/analytics/research-summaries-db.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | unclassified:community-2436 |
## Provenance
- Redis authority: `HLEN ace:authority:top` = 200
- Karpathy GPU:    `HLEN gpu:karpathy:scores` = 24
- Dirty files:     `SMEMBERS ace:rank:dirty_files` = 0
- AGENTS mirror:   `SELECT count(*) FROM agent_context_files` = 0+ (top 30)
- Timeline doc:    `docs/agent_timeline_synthesis.md` (4410 chars)
- Karpathy doc:    `next_steps/active/karpathy-gpu-recommendations.md` (2856 chars)
## Refresh Commands
```bash
npm run graphify:gds           # rebuild Redis ace:authority:top
npm run karpathy:gpu           # rebuild gpu:karpathy:scores
npm run agents:synthesis       # rebuild docs/agent_timeline_synthesis.md
npm run agents:timeline:fast   # rebuild docs/agents_recommendations.md
npm run startup:ace            # refresh ace:rank:dirty_files
```