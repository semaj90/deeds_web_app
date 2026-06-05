# Compressed Semantic Geometry Report

Generated: 2026-06-05T14:49:23.302Z

## Contract

```txt
filters first
  -> approximate ANN / compressed semantic search
  -> dynamic oversampling when needed
  -> optional exact rescore on bounded candidates
  -> graph expansion
  -> NES/CHROM packet assembly
```

## Summary

- Qdrant available: true
- Qdrant points: 76261
- Qdrant quantization config detected: true
- Runtime packets: 32
- Runtime packets with sourceRefs: 29 (90.6%)
- Runtime packets with featureIds: 29 (90.6%)
- Runtime packets with Qdrant hits: 31 (96.9%)
- Runtime packets with Redis hot keys: 31 (96.9%)
- Low-context-density packets: 31
- Exact-rescore telemetry fields present: false

## Suggested Oversampling Buckets

- Low: 0
- Medium: 10
- High: 15

## Qdrant Signals

```json
{
  "status": "green",
  "pointsCount": 76261,
  "indexedVectorsCount": 143664,
  "quantizationConfig": {
    "scalar": {
      "type": "int8",
      "always_ram": true
    }
  },
  "hnswConfig": {
    "m": 16,
    "ef_construct": 100,
    "full_scan_threshold": 10000,
    "max_indexing_threads": 0,
    "on_disk": false
  },
  "optimizerConfig": {
    "deleted_threshold": 0.2,
    "vacuum_min_vector_number": 1000,
    "default_segment_number": 0,
    "max_segment_size": null,
    "memmap_threshold": null,
    "indexing_threshold": 20000,
    "flush_interval_sec": 5,
    "max_optimization_threads": null
  }
}
```

## Recent Candidate Policy Sample

| packet_id | sourceRefs | featureIds | qdrantHits | cacheHit | suggestedOversampling |
|---|---:|---:|---:|---|---|
| 32 | 2 | 2 | 8 | true | high |
| 31 | 5 | 5 | 8 | true | medium |
| 30 | 3 | 3 | 8 | true | high |
| 29 | 1 | 1 | 8 | true | high |
| 28 | 4 | 4 | 8 | true | medium |
| 27 | 3 | 3 | 8 | true | high |
| 26 | 2 | 2 | 8 | true | high |
| 25 | 1 | 1 | 8 | true | high |
| 24 | 4 | 4 | 8 | true | medium |
| 23 | 4 | 4 | 8 | true | medium |
| 22 | 1 | 1 | 8 | true | high |
| 21 | 2 | 2 | 8 | true | high |
| 20 | 3 | 3 | 8 | true | high |
| 19 | 2 | 2 | 8 | true | high |
| 18 | 3 | 3 | 8 | true | high |
| 17 | 4 | 4 | 8 | true | medium |
| 16 | 0 | 0 | 8 | true | high |
| 15 | 1 | 1 | 8 | true | high |
| 14 | 5 | 5 | 8 | true | medium |
| 13 | 1 | 1 | 8 | true | high |
| 12 | 5 | 5 | 8 | true | medium |
| 11 | 5 | 5 | 8 | true | medium |
| 10 | 5 | 5 | 8 | true | medium |
| 9 | 5 | 5 | 8 | true | medium |
| 8 | 1 | 1 | 8 | true | high |

## Notes

- This report is read-only and does not update Qdrant collection settings.
- A missing Qdrant quantization config is not a failure by itself. It only means the collection is not proving the PQ/scalar compression part through config introspection.
- Exact rescore must remain bounded to the approximate candidate set and must preserve `sourceRef`, `feature_id`, and packet provenance.
- `route_runtime_packets` remains JSONB telemetry. It is not a matmul or GPU lane.
