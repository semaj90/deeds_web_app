# Retrieval E2E Benchmark
Generated: 2026-06-20T16:40:19.052Z

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
| total_ms | 2794 | 3634 |
| qdrant_ms | 19 | 50 |
| postgres_lookup_ms | 2 | 3 |
| neo4j_expand_ms | 0 | 0 |
| redis_cache_ms | 270 | 277 |
| gpu_rerank_ms | 323 | 355 |
| answer_ms | 2057 | 2807 |

## Per Query

| Query | Strategy | Qdrant hits | Ledger | Tree | Glyph | Neo4j | Rerank | Answer chars | Total ms | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| find parent atlas identity spine | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 737 | 3764 | degraded |
| phase 16 higher hop qdrant discovery | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 616 | 2649 | degraded |
| trace mcp tool validation | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 552 | 2476 | degraded |
| nes chrom packet qdrant point id | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 974 | 3634 | degraded |
| graph refresh manifest invalidation | fusion | 12 | 0 | 0 | 0 | 0 | 0 | 697 | 2794 | degraded |

## Notes

- Qdrant healthy and TRACE MCP healthy are required gates.
- Redis, Neo4j, GPU rerank, and TurboQuant/Gemma4 answer lanes are allowed to degrade.
- This benchmark is read-only and does not write to Postgres, Qdrant, or Redis.

## Errors

- no_hop_index_matches_across_all_queries (informational: hop index covers ~6% of Qdrant points)