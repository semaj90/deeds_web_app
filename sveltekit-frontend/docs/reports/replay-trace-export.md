# Replay Trace Summary

Generated: 2026-06-21T22:46:32.655Z
Status: pass_with_warnings
Replay queries: 1
Replay packets: 5

## Coverage

- Cache proof: PASS
- Cache proof warm+repeat hit pct: 100.0%
- Cache namespaces: hyperrag:query
- Neo4j proof: GRAPH_DEGRADED
- Neo4j graph hits: 0
- Neo4j graph stage values: GRAPH_DEGRADED
- Neo4j graph stage reasons: neo4j expansion not returned for this replay entry
- Qdrant hits: 100.0%
- Cache hits: 100.0%
- Packet key coverage: 100.0%
- Feature id coverage: 100.0%
- Source ref coverage: 100.0%
- Provenance coverage: 100.0%

## Latency

| Metric | p50 ms | p95 ms |
|---|---:|---:|
| total_ms | 3231 | 3231 |
| bm25_ms | 5 | 5 |
| qdrant_ms | 5 | 5 |
| redis_ms | 1 | 1 |
| neo4j_ms | 0 | 0 |
| fusion_ms | 5 | 5 |

## Top Packet Fields

- packet_key: nes:utility:9fa84252
- source_ref: src/lib/types/svelte5-api-types.d.ts
- source_ref_key: src/lib/types/svelte5-api-types.d.ts
- feature_id: utility
- domain_class: n/a
- ontology_label: types
- topology_label: types
- cache_hit_source: redis_exact_match
- cache_namespace: hyperrag:query
- cache_key: hyperrag:query:a1148d4ae02843fc7d0edce1791e6574bbcc948a59146ffdf80db0da4187f4ee
- query_normalized: qdrant vector retrieval fusion rrf
- graph_stage_status: GRAPH_DEGRADED
- graph_stage_reason: neo4j expansion not returned for this replay entry
- fusion_score: n/a
- traversal_path: packet_rpc -> redis -> postgres -> qdrant -> rrf

## Top Sources

- src/lib/types/svelte5-api-types.d.ts: 1

## Top Features

- utility: 1

## Notes

- Fresh replay breadth comes from live Redis trace entries, not point samples.
- Replay breadth target reached.
- Neo4j is treated as background analysis, not canonical truth.
- Provenance breadth is present in the replay trace export.