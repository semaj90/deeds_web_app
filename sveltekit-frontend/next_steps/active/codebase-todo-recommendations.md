# Codebase TODO Recommendations
> **This file is auto-generated** by `npm run skill:codebase-todo`.
> For human-edited planning + commentary, see [`2026-05-08_pipeline-driven-next-actions.md`](./2026-05-08_pipeline-driven-next-actions.md).
>
> Generated: 2026-05-08T07:06:43Z | Top-25 by fused authority + Karpathy GPU + dirty-file signal
> Sources: Redis ace:authority:top + gpu:karpathy:scores + ace:rank:dirty_files,
>          Postgres agent_context_files, MCP clusters.get_summary_lenses,
>          docs/agent_timeline_synthesis.md
## Gemma4 Synthesis

* **`lib/server/db/client.ts`**: Review and harden the database connection logic to ensure resilience against connection pool exhaustion or transient network failures, as this is the highest authority file.
* **`lib/server/env.server.ts`**: Refactor environment loading to eliminate hardcoded `localhost` fallbacks, ensuring the service adheres to robust containerized deployment standards.
* **`routes/api/analytics/research-graph/+server.ts`**: Investigate the integration of the research graph endpoint to ensure it correctly handles complex path-alias matching, given the recent focus on graph stability.
* **`lib/server/redis.ts`**: Audit the Redis client usage to confirm proper connection lifecycle management, especially in high-throughput scenarios, to prevent resource leaks.
* **`lib/server/ollama.ts`**: Review the Ollama integration to validate that tool requests are parsed and executed reliably, matching the recent focus on agent tool robustness.
* **`lib/server/gpu/libtorch-bridge.ts`**: Validate the GPU bridge's resource management, ensuring that PyTorch resources are correctly initialized and cleaned up to prevent memory leaks during extended analysis sessions.
* **`lib/server/db/relations.ts`**: Review the data relations layer to ensure schema migrations are atomic and correctly ordered, as this file is central to data integrity.

## Ranked Targets
| # | File | Blend | PR | Authority | Attention | Dirty | Reasons |
|---|------|-------|----|-----------|-----------|-------|---------|
| 1 | `src/lib/server/db/client.ts` | 0.622 | 7.06 | 0.55 | 0.79 | · | authority=0.55, PR=7.1 |
| 2 | `src/lib/server/env.server.ts` | 0.392 | 5.28 | 0.37 | 0.27 | · | PR=5.3 |
| 3 | `src/routes/api/analytics/research-graph/+server.ts` | 0.360 | 0.15 | 0.35 | 0.90 | · | unclassified:community-2590 |
| 4 | `src/lib/server/redis.ts` | 0.334 | 0.15 | 0.35 | 0.28 | · | unclassified:community-2516 |
| 5 | `src/lib/server/db/relations.ts` | 0.333 | 1.83 | 0.25 | 0.91 | · | — |
| 6 | `src/lib/server/ollama.ts` | 0.332 | 3.41 | 0.32 | 0.42 | · | PR=3.4 |
| 7 | `src/lib/server/db/schema/legal-nodes.ts` | 0.328 | 1.68 | 0.26 | 0.91 | · | — |
| 8 | `src/lib/server/db/schema/legal-citations.ts` | 0.313 | 1.78 | 0.26 | 0.80 | · | — |
| 9 | `src/lib/server/neo4j-driver.ts` | 0.313 | 1.84 | 0.20 | 0.92 | · | — |
| 10 | `src/lib/server/db/schema/case-library-links.ts` | 0.308 | 1.60 | 0.27 | 0.79 | · | — |
| 11 | `src/lib/server/gpu/libtorch-bridge.ts` | 0.305 | 0.15 | 0.35 | 0.55 | · | unclassified:community-2475 |
| 12 | `src/lib/server/analysis/worker.ts` | 0.304 | 1.90 | 0.21 | 0.85 | · | — |
| 13 | `src/lib/server/validation.ts` | 0.297 | 1.63 | 0.18 | 0.92 | · | — |
| 14 | `src/routes/api/test/redis-direct/+server.ts` | 0.296 | 1.78 | 0.36 | 0.46 | · | — |
| 15 | `src/lib/db/schema/cutlass.ts` | 0.286 | 1.65 | 0.14 | 0.96 | · | high-attention |
| 16 | `src/lib/server/gpu/simdjson-bridge.ts` | 0.282 | 1.85 | 0.21 | 0.72 | · | — |
| 17 | `src/lib/server/db/schema/library-documents.ts` | 0.279 | 1.80 | 0.26 | 0.60 | · | — |
| 18 | `src/lib/server/db/utils.ts` | 0.272 | 1.69 | 0.27 | 0.55 | · | — |
| 19 | `src/lib/db/schema/ace-web.ts` | 0.270 | 1.62 | 0.14 | 0.87 | · | — |
| 20 | `src/lib/server/grpc/embedding-client.ts` | 0.262 | 0.15 | 0.35 | 0.29 | · | unclassified:community-2493 |
| 21 | `src/lib/server/retrieval/context-buffer.ts` | 0.260 | 1.72 | 0.20 | 0.66 | · | — |
| 22 | `src/lib/polyfills.ts` | 0.255 | 1.59 | 0.13 | 0.82 | · | — |
| 23 | `src/lib/webgpu/wire-telemetry.ts` | 0.253 | 1.62 | 0.14 | 0.78 | · | — |
| 24 | `src/lib/server/minio.ts` | 0.248 | 1.64 | 0.19 | 0.61 | · | — |
| 25 | `src/lib/server/ai/langgraph-client.ts` | 0.248 | 1.60 | 0.19 | 0.64 | · | — |
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
- Karpathy GPU:    `HLEN gpu:karpathy:scores` = 48
- Dirty files:     `SMEMBERS ace:rank:dirty_files` = 0
- AGENTS mirror:   `SELECT count(*) FROM agent_context_files` = 30+ (top 30)
- Timeline doc:    `docs/agent_timeline_synthesis.md` (4410 chars)
- Karpathy doc:    `next_steps/active/karpathy-gpu-recommendations.md` (2877 chars)
## Refresh Commands
```bash
npm run graphify:gds           # rebuild Redis ace:authority:top
npm run karpathy:gpu           # rebuild gpu:karpathy:scores
npm run agents:synthesis       # rebuild docs/agent_timeline_synthesis.md
npm run agents:timeline:fast   # rebuild docs/agents_recommendations.md
npm run startup:ace            # refresh ace:rank:dirty_files
```