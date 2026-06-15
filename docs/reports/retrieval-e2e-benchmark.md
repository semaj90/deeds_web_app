# Retrieval E2E Benchmark
Generated: 2026-06-15T20:09:35.624Z

## Summary

- Status: failed
- Queries: 5
- Qdrant: READY
- TRACE MCP: READY
- Redis: READY
- GPU rerank: DEGRADED
- TurboQuant/Gemma4 answer: READY

## Latency

| Metric | p50 ms | p95 ms |
|---|---:|---:|
| total_ms | 8226 | 8301 |
| qdrant_ms | 10 | 11 |
| postgres_lookup_ms | 2 | 4 |
| neo4j_expand_ms | 0 | 0 |
| redis_cache_ms | 7 | 7 |
| gpu_rerank_ms | 279 | 314 |
| answer_ms | 2500 | 2702 |

## Per Query

| Query | Qdrant hits | Ledger | Tree | Glyph | Neo4j | Rerank | Answer chars | Total ms | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| find parent atlas identity spine | 12 | 0 | 0 | 0 | 0 | 0 | 692 | 8226 | degraded |
| phase 16 higher hop qdrant discovery | 12 | 0 | 0 | 0 | 0 | 0 | 761 | 2585 | degraded |
| trace mcp tool validation | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 40011 | degraded |
| nes chrom packet qdrant point id | 12 | 0 | 0 | 0 | 0 | 0 | 788 | 8301 | degraded |
| graph refresh manifest invalidation | 12 | 0 | 0 | 0 | 0 | 0 | 844 | 3097 | degraded |

## Notes

- Qdrant healthy and TRACE MCP healthy are required gates.
- Redis, Neo4j, GPU rerank, and TurboQuant/Gemma4 answer lanes are allowed to degrade.
- This benchmark is read-only and does not write to Postgres, Qdrant, or Redis.

## Errors

- one_or_more_queries_failed_core_pass_criteria
- no_hop_index_matches_across_all_queries (informational: hop index covers ~6% of Qdrant points)