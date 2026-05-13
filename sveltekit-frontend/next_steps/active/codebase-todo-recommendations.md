# Codebase TODO Recommendations
> **This file is auto-generated** by `npm run skill:codebase-todo`.
> For human-edited planning + commentary, see [`2026-05-08_pipeline-driven-next-actions.md`](./2026-05-08_pipeline-driven-next-actions.md).
>
> Generated: 2026-05-08T07:10:38Z | Top-25 by fused authority + Karpathy GPU + dirty-file signal
> Sources: Redis ace:authority:top + gpu:karpathy:scores + ace:rank:dirty_files,
>          Postgres agent_context_files, MCP clusters.get_summary_lenses,
>          docs/agent_timeline_synthesis.md
## Gemma4 Synthesis

* **`lib/server/db/client.ts`**: Review and refactor the database client initialization to ensure all connection pooling logic is resilient to environment changes. (High authority suggests this is a core dependency needing immediate stability checks.)
* **`lib/server/env.server.ts`**: Standardize environment variable loading across the entire application to eliminate hardcoded `localhost` fallbacks and improve container portability. (High recent focus on environment hardening suggests this is a critical, high-impact cleanup task.)
* **`lib/server/atlas/context-for-file.ts`**: Extend the path-mapping layer to read from the daily activity atlas so date-scoped workflow context can be reused before agent synthesis. (This makes the new atlas doc operational rather than just descriptive.)
* **`routes/api/analytics/research-graph/+server.ts`**: Audit the graph endpoint logic to confirm it correctly handles path-alias expansion for Qdrant/Neo4j consistency. (The recent activity shows graph/indexing issues are a primary source of bugs.)
* **`lib/server/redis.ts`**: Implement robust connection health checks and automatic reconnection logic for Redis to prevent cascading failures during transient network issues. (Redis is a key piece of infrastructure highlighted in recent fixes, demanding reliability improvements.)
* **`lib/server/ollama.ts`**: Review the Ollama interaction layer to ensure proper error handling for model unavailability or unexpected API responses. (Agent/Tooling reliability is a major theme, and this file manages a key external dependency.)
* **`lib/server/gpu/libtorch-bridge.ts`**: Investigate and document the GPU resource management lifecycle to ensure deterministic cleanup of PyTorch resources. (This file relates to complex, low-level infrastructure that needs hardening to prevent resource leaks.)

## Ranked Targets
| # | File | Blend | PR | Authority | Attention | Dirty | Reasons |
|---|------|-------|----|-----------|-----------|-------|---------|
| 1 | `src/lib/server/db/client.ts` | 0.622 | 7.06 | 0.55 | 0.79 | · | authority=0.55, PR=7.1 |
| 2 | `src/lib/server/env.server.ts` | 0.392 | 5.28 | 0.37 | 0.27 | · | PR=5.3 |
| 3 | `src/lib/server/atlas/context-for-file.ts` | 0.371 | 0.15 | 0.36 | 0.82 | · | atlas + daily activity context reuse |
| 4 | `src/routes/api/analytics/research-graph/+server.ts` | 0.360 | 0.15 | 0.35 | 0.90 | · | unclassified:community-2590 |
| 5 | `src/lib/server/redis.ts` | 0.334 | 0.15 | 0.35 | 0.28 | · | unclassified:community-2516 |
| 6 | `src/lib/server/db/relations.ts` | 0.333 | 1.83 | 0.25 | 0.91 | · | — |
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
