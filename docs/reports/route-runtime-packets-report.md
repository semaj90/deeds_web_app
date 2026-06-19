# Route Runtime Packets Report

Generated: 2026-06-19T04:19:47.704Z

## Summary

- Total packets: 1
- Last 24h: 0
- Cache hit rate: 0%
- Average Qdrant hits: 1
- Average latency ms: 45
- Empty sourceRefs: 0
- Empty featureIds: 0
- Missing SOM/cluster: 0
- Low context density rows: 1
- Redis LOD0 found: 1/1

## Top SourceRefs

| source_ref | hits |
| --- | --- |
| smoke-source-ref | 1 |

## Top Features

| feature_id | hits |
| --- | --- |
| smoke-feature | 1 |

## Top Redis Hot Keys

_No rows._

## Top SOM Clusters

| som_cluster | hits |
| --- | --- |
| 0:0 | 1 |

## Cache Tiers

| cache_tier | hits |
| --- | --- |
| missing | 1 |

## Recent Low-Density Packets

| id | query_preview | source_ref_count | qdrant_hits | cache_tier |
| --- | --- | --- | --- | --- |
| 208 | smoke query preview | 1 | 1 | missing |


## Notes

- `route_runtime_packets` is JSONB audit telemetry. It is not a GPU/matmul lane.
- Redis `ace:telemetry:{packet_id}:lod0` is the compact replay packet checked here.
- Neo4j traversal depth is not stored directly in `route_runtime_packets`; use replay smoke for traversal proof or add a later derived replay report.