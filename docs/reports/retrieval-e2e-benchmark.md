# Retrieval E2E Benchmark
Generated: 2026-06-19T20:00:08.285Z

## Summary

- Status: PASS_WITH_WARNINGS
- Queries: 5
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
| total_ms | 2893 | 3368 |
| qdrant_ms | 42 | 49 |
| postgres_lookup_ms | 2 | 4 |
| neo4j_expand_ms | 0 | 0 |
| redis_cache_ms | 5 | 6 |
| gpu_rerank_ms | 405 | 434 |
| answer_ms | 2232 | 2265 |

## Per Query

| Query | Strategy | Qdrant hits | Ledger | Tree | Glyph | Neo4j | Rerank | Answer chars | Total ms | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| find parent atlas identity spine | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 471 | 7531 | degraded |
| phase 16 higher hop qdrant discovery | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 759 | 2893 | degraded |
| trace mcp tool validation | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 568 | 2182 | degraded |
| nes chrom packet qdrant point id | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 1008 | 3368 | degraded |
| graph refresh manifest invalidation | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 731 | 2791 | degraded |

## Notes

- Qdrant healthy and TRACE MCP healthy are required gates.
- Redis, Neo4j, GPU rerank, and TurboQuant/Gemma4 answer lanes are allowed to degrade.
- This benchmark is read-only and does not write to Postgres, Qdrant, or Redis.

## Errors

- no_hop_index_matches_across_all_queries (informational: hop index covers ~6% of Qdrant points)