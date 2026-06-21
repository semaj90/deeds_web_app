# Retrieval E2E Benchmark
Generated: 2026-06-21T06:30:50.735Z

## Summary

- Status: PASS_WITH_WARNINGS
- Queries: 5
- Graph proof: PASS
- Source ref pct: 100
- Feature id pct: 100
- Qdrant: READY
- TRACE MCP: READY
- Redis: READY
- GPU rerank: DEGRADED
- TurboQuant/Gemma4 answer: READY

## Retrieval Strategy

- fusion: 5
- fallback: 0
- failed: 0

## Latency

| Metric | p50 ms | p95 ms |
|---|---:|---:|
| total_ms | 8876 | 8920 |
| qdrant_ms | 12 | 12 |
| postgres_lookup_ms | 56 | 67 |
| neo4j_expand_ms | 136 | 137 |
| redis_cache_ms | 2455 | 2525 |
| gpu_rerank_ms | 249 | 252 |
| answer_ms | 5880 | 6032 |

## Per Query

| Query | Strategy | Qdrant hits | Ledger | Tree | Glyph | Neo4j | Graph | Src % | Feat % | Rerank | Answer chars | Total ms | Status |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---|
| src/lib/components/agent/AutonomousInvestigator.svelte | fusion | 12 | 3251 | 3251 | 0 | 3251 | GRAPH_ENABLED | 100 | 100 | 0 | 836 | 7849 | degraded |
| src/routes/admin/observability/+page.server.ts | fusion | 12 | 3251 | 3251 | 0 | 3251 | GRAPH_ENABLED | 100 | 100 | 0 | 844 | 8876 | degraded |
| src/lib/components/ui/index.ts | fusion | 12 | 3251 | 3251 | 0 | 3251 | GRAPH_ENABLED | 100 | 100 | 0 | 828 | 9068 | degraded |
| src/mcp/server.ts | fusion | 12 | 3251 | 3251 | 0 | 3251 | GRAPH_ENABLED | 100 | 100 | 0 | 775 | 8835 | degraded |
| src/lib/server/db/schema/memory-registry.ts | fusion | 12 | 3251 | 3251 | 0 | 3251 | GRAPH_ENABLED | 100 | 100 | 0 | 805 | 8920 | degraded |

## Notes

- Qdrant healthy and TRACE MCP healthy are required gates.
- Redis, Neo4j, GPU rerank, and TurboQuant/Gemma4 answer lanes are allowed to degrade.
- This benchmark is read-only and does not write to Postgres, Qdrant, or Redis.

## Errors

- None