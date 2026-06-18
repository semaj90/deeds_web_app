# Retrieval E2E Benchmark
Generated: 2026-06-18T00:16:14.834Z

## Summary

- Status: PASS
- Queries: 5
- Qdrant: READY
- TRACE MCP: READY
- Redis: READY
- GPU rerank: READY
- TurboQuant/Gemma4 answer: READY

## Retrieval Strategy

- fusion: 5
- fallback: 0
- failed: 0

## Latency

| Metric | p50 ms | p95 ms |
|---|---:|---:|
| total_ms | 3407 | 3536 |
| qdrant_ms | 11 | 11 |
| postgres_lookup_ms | 3 | 3 |
| neo4j_expand_ms | 0 | 0 |
| redis_cache_ms | 6 | 6 |
| gpu_rerank_ms | 820 | 830 |
| answer_ms | 2350 | 2569 |

## Per Query

| Query | Strategy | Qdrant hits | Ledger | Tree | Glyph | Neo4j | Rerank | Answer chars | Total ms | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| find parent atlas identity spine | fusion | 12 | 0 | 0 | 0 | 0 | 12 | 656 | 3177 | pass |
| phase 16 higher hop qdrant discovery | fusion | 12 | 0 | 0 | 0 | 0 | 12 | 798 | 3536 | pass |
| trace mcp tool validation | fusion | 12 | 0 | 0 | 0 | 0 | 12 | 705 | 3407 | pass |
| nes chrom packet qdrant point id | fusion | 12 | 0 | 0 | 0 | 0 | 12 | 865 | 3654 | pass |
| graph refresh manifest invalidation | fusion | 12 | 0 | 0 | 0 | 0 | 12 | 710 | 3206 | pass |

## Notes

- Qdrant healthy and TRACE MCP healthy are required gates.
- Redis, Neo4j, GPU rerank, and TurboQuant/Gemma4 answer lanes are allowed to degrade.
- This benchmark is read-only and does not write to Postgres, Qdrant, or Redis.

## Errors

- no_hop_index_matches_across_all_queries (informational: hop index covers ~6% of Qdrant points)