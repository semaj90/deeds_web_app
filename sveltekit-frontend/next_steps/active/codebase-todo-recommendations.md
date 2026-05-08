# Codebase TODO Recommendations
> Generated: 2026-05-08T04:56:22Z | Top-25 by fused authority + Karpathy GPU + dirty-file signal
> Sources: Redis ace:authority:top + gpu:karpathy:scores + ace:rank:dirty_files,
>          Postgres agent_context_files, MCP clusters.get_summary_lenses,
>          docs/agent_timeline_synthesis.md
## (Gemma4 rerank skipped or unavailable)

## Ranked Targets
| # | File | Blend | PR | Authority | Attention | Dirty | Reasons |
|---|------|-------|----|-----------|-----------|-------|---------|
| 1 | `src/lib/server/db/client.ts` | 0.660 | 7.06 | 0.55 | 1.00 | · | authority=0.55, high-attention, PR=7.1 |
| 2 | `src/lib/server/env.server.ts` | 0.520 | 5.28 | 0.37 | 1.00 | · | high-attention, PR=5.3 |
| 3 | `src/lib/server/redis.ts` | 0.460 | 0.15 | 0.35 | 1.00 | · | high-attention, unclassified:community-2516 |
| 4 | `src/lib/server/ollama.ts` | 0.433 | 3.41 | 0.32 | 1.00 | · | high-attention, PR=3.4 |
| 5 | `src/lib/server/middleware/cache-headers.ts` | 0.396 | 3.17 | 0.26 | 0.99 | · | high-attention, PR=3.2 |
| 6 | `src/routes/api/test/redis-direct/+server.ts` | 0.390 | 1.78 | 0.36 | 1.00 | · | high-attention |
| 7 | `src/lib/server/grpc/embedding-client.ts` | 0.386 | 0.15 | 0.35 | 1.00 | · | high-attention, unclassified:community-2493 |
| 8 | `src/lib/server/gpu/libtorch-bridge.ts` | 0.384 | 0.15 | 0.35 | 1.00 | · | high-attention, unclassified:community-2475 |
| 9 | `src/lib/server/vector/qdrant-manager.ts` | 0.362 | 1.81 | 0.29 | 1.00 | · | high-attention |
| 10 | `src/lib/server/observability/langfuse.ts` | 0.358 | 2.45 | 0.23 | 1.00 | · | high-attention |
| 11 | `src/lib/config/env.server.ts` | 0.354 | 2.71 | 0.20 | 1.00 | · | high-attention |
| 12 | `src/lib/server/db/utils.ts` | 0.350 | 1.69 | 0.27 | 1.00 | · | high-attention |
| 13 | `src/lib/server/db/relations.ts` | 0.348 | 1.83 | 0.25 | 1.00 | · | high-attention |
| 14 | `src/lib/server/db/schema/library-documents.ts` | 0.348 | 1.80 | 0.26 | 1.00 | · | high-attention |
| 15 | `src/lib/server/db/schema/legal-citations.ts` | 0.348 | 1.78 | 0.26 | 1.00 | · | high-attention |
| 16 | `src/lib/server/db/schema-evidence-crud.ts` | 0.346 | 1.76 | 0.26 | 1.00 | · | high-attention |
| 17 | `src/lib/server/observability/inference-log.ts` | 0.340 | 2.13 | 0.21 | 1.00 | · | high-attention |
| 18 | `src/lib/server/cache.ts` | 0.337 | 1.90 | 0.22 | 0.99 | · | high-attention |
| 19 | `src/lib/server/lucia.ts` | 0.334 | 1.78 | 0.22 | 1.00 | · | high-attention |
| 20 | `src/lib/server/analysis/worker.ts` | 0.331 | 1.90 | 0.21 | 1.00 | · | high-attention |
| 21 | `src/lib/server/gpu/simdjson-bridge.ts` | 0.330 | 1.85 | 0.21 | 1.00 | · | high-attention |
| 22 | `src/lib/server/neo4j-driver.ts` | 0.327 | 1.84 | 0.20 | 1.00 | · | high-attention |
| 23 | `src/lib/server/minio-client.ts` | 0.326 | 1.83 | 0.20 | 0.99 | · | high-attention |
| 24 | `src/lib/server/retrieval/context-buffer.ts` | 0.320 | 1.72 | 0.20 | 1.00 | · | high-attention |
| 25 | `lib/server/analytics/research-summaries-db.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | unclassified:community-2436 |
## Directories with the Strictest AGENTS.md Rules

| Directory | Rule Count | Last Indexed |
|-----------|-----------|--------------|
| `../AGENTS.md` | 16 | 2026-05-08T01:42:55.768Z |
| `src/lib/server/search/AGENTS.md` | 12 | 2026-05-08T01:42:57.938Z |
| `tests/unit/AGENTS.md` | 9 | 2026-05-08T01:43:01.951Z |
| `tests/scripts/AGENTS.md` | 9 | 2026-05-08T01:43:01.940Z |
| `tests/routes/auto/api/yorha/AGENTS.md` | 9 | 2026-05-08T01:43:01.923Z |
| `tests/routes/auto/api/wiki/AGENTS.md` | 9 | 2026-05-08T01:43:01.905Z |
| `tests/routes/auto/api/web/AGENTS.md` | 9 | 2026-05-08T01:43:01.884Z |
| `tests/routes/auto/api/v1/evidence/AGENTS.md` | 9 | 2026-05-08T01:43:01.862Z |
| `tests/routes/auto/api/v1/chat/AGENTS.md` | 9 | 2026-05-08T01:43:01.845Z |
| `tests/routes/auto/api/v1/ai/AGENTS.md` | 9 | 2026-05-08T01:43:01.831Z |
## Provenance
- Redis authority: `HLEN ace:authority:top` = 200
- Karpathy GPU:    `HLEN gpu:karpathy:scores` = 24
- Dirty files:     `SMEMBERS ace:rank:dirty_files` = 0
- AGENTS mirror:   `SELECT count(*) FROM agent_context_files` = 30+ (top 30)
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