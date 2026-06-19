# Retrieval E2E Benchmark
Generated: 2026-06-19T05:34:34.817Z

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
| total_ms | 2602 | 3267 |
| qdrant_ms | 20 | 21 |
| postgres_lookup_ms | 2 | 2 |
| neo4j_expand_ms | 0 | 0 |
| redis_cache_ms | 6 | 6 |
| gpu_rerank_ms | 277 | 278 |
| answer_ms | 2172 | 2532 |

## Per Query

| Query | Strategy | Qdrant hits | Ledger | Tree | Glyph | Neo4j | Rerank | Answer chars | Total ms | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| find parent atlas identity spine | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 595 | 7888 | degraded |
| phase 16 higher hop qdrant discovery | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 713 | 2602 | degraded |
| trace mcp tool validation | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 681 | 2539 | degraded |
| nes chrom packet qdrant point id | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 925 | 3267 | degraded |
| graph refresh manifest invalidation | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 713 | 2528 | degraded |

## Notes

- Qdrant healthy and TRACE MCP healthy are required gates.
- Redis, Neo4j, GPU rerank, and TurboQuant/Gemma4 answer lanes are allowed to degrade.
- This benchmark is read-only and does not write to Postgres, Qdrant, or Redis.

## Errors

- no_hop_index_matches_across_all_queries (informational: hop index covers ~6% of Qdrant points)