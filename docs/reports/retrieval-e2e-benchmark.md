# Retrieval E2E Benchmark
Generated: 2026-09-01T04:08:18.004Z

## Summary

- Status: PASS
- Queries: 5
- Graph proof: PASS
- Source ref pct: 100
- Feature id pct: 100
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
| total_ms | 9354 | 11287 |
| qdrant_ms | 334 | 590 |
| postgres_lookup_ms | 35 | 37 |
| neo4j_expand_ms | 1344 | 3638 |
| redis_cache_ms | 566 | 600 |
| gpu_rerank_ms | 1949 | 2195 |
| answer_ms | 5234 | 5411 |

## Per Query

| Query | Strategy | Qdrant hits | Ledger | Tree | Glyph | Neo4j | Graph | Src % | Feat % | Rerank | Answer chars | Total ms | Status |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---|
| src/lib/components/agent/AutonomousInvestigator.svelte | fusion | 12 | 3 | 3 | 0 | 0 | GRAPH_ENABLED | 100 | 100 | 12 | 314 | 25288 | pass |
| src/routes/admin/observability/+page.server.ts | fusion | 12 | 777 | 0 | 0 | 0 | GRAPH_ENABLED | 100 | 100 | 12 | 378 | 11287 | pass |
| src/lib/components/ui/index.ts | fusion | 12 | 121 | 54 | 0 | 0 | GRAPH_ENABLED | 100 | 100 | 12 | 137 | 9045 | pass |
| src/mcp/server.ts | fusion | 12 | 1 | 0 | 0 | 0 | GRAPH_ENABLED | 100 | 100 | 12 | 287 | 8396 | pass |
| src/lib/server/db/schema/memory-registry.ts | fusion | 12 | 10 | 2 | 0 | 0 | GRAPH_ENABLED | 100 | 100 | 12 | 324 | 9354 | pass |

## Notes

- Qdrant healthy and TRACE MCP healthy are required gates.
- Redis, Neo4j, GPU rerank, and TurboQuant/Gemma4 answer lanes are allowed to degrade.
- This benchmark is read-only and does not write to Postgres, Qdrant, or Redis.

## Errors

- None