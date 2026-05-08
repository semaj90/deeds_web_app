# Codebase TODO Recommendations
> Generated: 2026-05-08T04:13:36Z | Top-25 by fused authority + Karpathy GPU + dirty-file signal
> Sources: Redis ace:authority:top + gpu:karpathy:scores + ace:rank:dirty_files,
>          Postgres agent_context_files, MCP clusters.get_summary_lenses,
>          docs/agent_timeline_synthesis.md
## (Gemma4 rerank skipped or unavailable)

## Ranked Targets
| # | File | Blend | PR | Authority | Attention | Dirty | Reasons |
|---|------|-------|----|-----------|-----------|-------|---------|
| 1 | `src/lib/server/db/client.ts` | 0.288 | 0.00 | 0.00 | 0.00 | · | — |
| 2 | `src/lib/server/env.server.ts` | 0.221 | 0.00 | 0.00 | 0.00 | · | — |
| 3 | `src/lib/server/redis.ts` | 0.171 | 0.00 | 0.00 | 0.00 | · | — |
| 4 | `src/lib/server/ollama.ts` | 0.154 | 0.00 | 0.00 | 0.00 | · | — |
| 5 | `src/lib/server/middleware/cache-headers.ts` | 0.144 | 0.00 | 0.00 | 0.00 | · | — |
| 6 | `lib/server/analytics/research-summaries-db.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 7 | `lib/server/graph/gpu-graph-analysis.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 8 | `lib/server/ai/kv-context-controller.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 9 | `lib/server/queue/rabbitmq-manager-fixed.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 10 | `lib/server/analytics/research-graph-rl.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 11 | `lib/server/db/unified-client.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 12 | `lib/server/graph/graph-intel.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 13 | `lib/server/ace/hmm-wiki-logger.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 14 | `lib/server/llm/contextual-chat.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 15 | `lib/server/ace/ngram-retrieval.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 16 | `lib/server/graph/user-interaction-sync.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 17 | `lib/server/embedding/embed-schema.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 18 | `lib/server/analytics/mapreduce-matrix-analysis.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 19 | `lib/server/legal/constitution-pipeline.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 20 | `lib/server/couchdb/memory-mirror.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 21 | `routes/(analysis)@/audio-analysis/[evidenceId]/+page.server.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 22 | `lib/db/schema.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 23 | `lib/server/graph/codebase-cluster-detection.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 24 | `lib/server/engagement/idle-reengagement.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
| 25 | `lib/server/graph/neo4j-schema.ts` | 0.140 | 0.15 | 0.35 | 0.00 | · | — |
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