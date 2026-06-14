# Qdrant/Postgres Mismatch Debug Report

Generated: 2026-06-14T04:05:01.758Z

## Summary

- **Total Sampled**: 50
- **Agreement**: 0/50 (0.00%)
- **Missing Postgres Rows**: 50

## Mismatch Histogram

| Mismatch Type | Count |
|---|---|
| source_ref | 0 |
| packet_key | 0 |
| feature_id | 0 |
| feature_label | 0 |
| community_id | 0 |
| domain_class | 0 |

## Canonical Comparator

The debug script uses this canonical contract:

```
source_ref (normalized: no leading ./, windows backslash → /, lowercase)
packet_key
feature_id
feature_label
community_id
domain_class
```

## Sample Points (First 10)


### Point 1: 86694

**Qdrant Canonical**:
```json
{
  "source_ref": "src/routes/api/research/concurrent-deep/stream/+server.ts",
  "packet_key": "src/routes/api/research/concurrent-deep/stream/+server.ts:d391b7e92c36906b",
  "feature_id": "routes",
  "feature_label": "routes",
  "community_id": 2,
  "domain_class": "rag_retrieval"
}
```

**Postgres Canonical**:
(NOT FOUND)

**Mismatches**: MATCH ✓


### Point 2: 138065

**Qdrant Canonical**:
```json
{
  "source_ref": "src/routes/api/recommendations/+server.ts",
  "packet_key": "src/routes/api/recommendations/+server.ts:d5397aa82be3284c",
  "feature_id": "routes",
  "feature_label": "routes",
  "community_id": 6,
  "domain_class": "case_management"
}
```

**Postgres Canonical**:
(NOT FOUND)

**Mismatches**: MATCH ✓


### Point 3: 174637

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/server/ai/contextual-tools.ts",
  "packet_key": null,
  "feature_id": "ai",
  "feature_label": "lib",
  "community_id": "community:1305",
  "domain_class": "source"
}
```

**Postgres Canonical**:
(NOT FOUND)

**Mismatches**: MATCH ✓


### Point 4: 188608

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/server/research/reddit-harvester.ts",
  "packet_key": null,
  "feature_id": "research",
  "feature_label": "lib",
  "community_id": "community:14020",
  "domain_class": "source"
}
```

**Postgres Canonical**:
(NOT FOUND)

**Mismatches**: MATCH ✓


### Point 5: 194586

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/server/gpu/libtorch-bridge.ts",
  "packet_key": "src/lib/server/gpu/libtorch-bridge.ts:44dd86e0eace5c71",
  "feature_id": "utility",
  "feature_label": "lib",
  "community_id": 3,
  "domain_class": "gpu_turbovec_libtorch"
}
```

**Postgres Canonical**:
(NOT FOUND)

**Mismatches**: MATCH ✓


### Point 6: 227675

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/server/couchdb/mango-indexes.ts",
  "packet_key": null,
  "feature_id": "couchdb",
  "feature_label": "lib",
  "community_id": null,
  "domain_class": "source"
}
```

**Postgres Canonical**:
(NOT FOUND)

**Mismatches**: MATCH ✓


### Point 7: 292522

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/components/monitoring/cachemonitoringwidget.svelte",
  "packet_key": "src/lib/components/monitoring/CacheMonitoringWidget.svelte:f9470fb28e6f344a",
  "feature_id": "monitoring",
  "feature_label": "lib",
  "community_id": 92,
  "domain_class": "cache"
}
```

**Postgres Canonical**:
(NOT FOUND)

**Mismatches**: MATCH ✓


### Point 8: 346920

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/server/features/codebase-intel/indexer/directory-summarizer.ts",
  "packet_key": null,
  "feature_id": "lib",
  "feature_label": "lib",
  "community_id": "community:17885",
  "domain_class": "utility"
}
```

**Postgres Canonical**:
(NOT FOUND)

**Mismatches**: MATCH ✓


### Point 9: 404803

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/server/data/legal-seed-data.ts",
  "packet_key": null,
  "feature_id": "data",
  "feature_label": "lib",
  "community_id": "community:1305",
  "domain_class": "source"
}
```

**Postgres Canonical**:
(NOT FOUND)

**Mismatches**: MATCH ✓


### Point 10: 436451

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/components/citations/citationsaveform.svelte",
  "packet_key": null,
  "feature_id": "citations",
  "feature_label": "lib",
  "community_id": "community:1442",
  "domain_class": "source"
}
```

**Postgres Canonical**:
(NOT FOUND)

**Mismatches**: MATCH ✓


## Safeguards

- ✓ No Postgres mutations
- ✓ No row identity by feature_id (identity by source_ref)
- ✓ No higher-hop enrichment until agreement >95%
- ✓ Deferred fields (qdrant_tag_id, karpathy_score, redis_hot_key, neo4j_node) not checked

## Next Steps

❌ FAIL — Agreement <95%, identify root cause before enrichment
