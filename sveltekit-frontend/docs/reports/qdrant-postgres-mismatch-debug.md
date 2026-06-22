# Qdrant/Postgres Mismatch Debug Report

Generated: 2026-06-21T21:43:05.152Z

## Summary

- **Total Sampled**: 50
- **Agreement**: 3/50 (6.00%)
- **Missing Postgres Rows**: 40

## Mismatch Histogram

| Mismatch Type | Count |
|---|---|
| source_ref | 0 |
| packet_key | 2 |
| feature_id | 2 |
| feature_label | 2 |
| community_id | 7 |
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
  "feature_id": "stream",
  "feature_label": "Routes",
  "community_id": 4896,
  "domain_class": "source"
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
  "feature_id": "recommendations",
  "feature_label": "Routes",
  "community_id": 4983,
  "domain_class": "source"
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
  "packet_key": "src/lib/server/ai/contextual-tools.ts:b65c6a4d",
  "feature_id": "ai",
  "feature_label": "lib",
  "community_id": "community:1305",
  "domain_class": "source"
}
```

**Postgres Canonical**:
```json
{
  "source_ref": "src/lib/server/ai/contextual-tools.ts",
  "packet_key": "src/lib/server/ai/contextual-tools.ts:b65c6a4d",
  "feature_id": "ai",
  "feature_label": "lib",
  "community_id": null,
  "domain_class": null
}
```

**Mismatches**: community_id: "community:1305" vs "null"


### Point 4: 188608

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/server/research/reddit-harvester.ts",
  "packet_key": "src/lib/server/research/reddit-harvester.ts:78eef6c1",
  "feature_id": "research",
  "feature_label": "lib",
  "community_id": "community:14020",
  "domain_class": "source"
}
```

**Postgres Canonical**:
```json
{
  "source_ref": "src/lib/server/research/reddit-harvester.ts",
  "packet_key": "src/lib/server/research/reddit-harvester.ts:78eef6c1",
  "feature_id": "research",
  "feature_label": "lib",
  "community_id": null,
  "domain_class": null
}
```

**Mismatches**: community_id: "community:14020" vs "null"


### Point 5: 194586

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/server/gpu/libtorch-bridge.ts",
  "packet_key": "src/lib/server/gpu/libtorch-bridge.ts:44dd86e0eace5c71",
  "feature_id": "gpu",
  "feature_label": "Utility",
  "community_id": 4515,
  "domain_class": "source"
}
```

**Postgres Canonical**:
```json
{
  "source_ref": "src/lib/server/gpu/libtorch-bridge.ts",
  "packet_key": "nes:src/lib/server/gpu/libtorch-bridge.ts",
  "feature_id": "repo.file.src.lib.server.gpu.libtorch.bridge.ts",
  "feature_label": "Libtorch Bridge",
  "community_id": null,
  "domain_class": "codebase"
}
```

**Mismatches**: packet_key: "src/lib/server/gpu/libtorch-bridge.ts:44dd86e0eace5c71" vs "nes:src/lib/server/gpu/libtorch-bridge.ts", feature_id: "gpu" vs "repo.file.src.lib.server.gpu.libtorch.bridge.ts", feature_label: "Utility" vs "Libtorch Bridge", community_id: "4515" vs "null"


### Point 6: 227675

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/server/couchdb/mango-indexes.ts",
  "packet_key": "src/lib/server/couchdb/mango-indexes.ts:dff1fbc9",
  "feature_id": "couchdb",
  "feature_label": "lib",
  "community_id": null,
  "domain_class": "source"
}
```

**Postgres Canonical**:
```json
{
  "source_ref": "src/lib/server/couchdb/mango-indexes.ts",
  "packet_key": "src/lib/server/couchdb/mango-indexes.ts:dff1fbc9",
  "feature_id": "couchdb",
  "feature_label": "lib",
  "community_id": null,
  "domain_class": null
}
```

**Mismatches**: MATCH ✓


### Point 7: 292522

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/components/monitoring/CacheMonitoringWidget.svelte",
  "packet_key": "src/lib/components/monitoring/CacheMonitoringWidget.svelte:f9470fb28e6f344a",
  "feature_id": "monitoring",
  "feature_label": "Monitoring",
  "community_id": 4725,
  "domain_class": "source"
}
```

**Postgres Canonical**:
(NOT FOUND)

**Mismatches**: MATCH ✓


### Point 8: 404803

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/server/data/legal-seed-data.ts",
  "packet_key": "src/lib/server/data/legal-seed-data.ts:1ec45097",
  "feature_id": "data",
  "feature_label": "lib",
  "community_id": "community:1305",
  "domain_class": "source"
}
```

**Postgres Canonical**:
```json
{
  "source_ref": "src/lib/server/data/legal-seed-data.ts",
  "packet_key": "src/lib/server/data/legal-seed-data.ts:1ec45097",
  "feature_id": "data",
  "feature_label": "lib",
  "community_id": null,
  "domain_class": null
}
```

**Mismatches**: community_id: "community:1305" vs "null"


### Point 9: 436451

**Qdrant Canonical**:
```json
{
  "source_ref": "src/lib/components/citations/CitationSaveForm.svelte",
  "packet_key": "src/lib/components/citations/citationsaveform.svelte:77b10257",
  "feature_id": "citations",
  "feature_label": "lib",
  "community_id": "community:1442",
  "domain_class": "source"
}
```

**Postgres Canonical**:
(NOT FOUND)

**Mismatches**: MATCH ✓


### Point 10: 614211

**Qdrant Canonical**:
```json
{
  "source_ref": "src/routes/(app)/admin/atlas/+page.server.ts",
  "packet_key": "src/routes/(app)/admin/atlas/+page.server.ts:8ac8a88cbd487045",
  "feature_id": "atlas",
  "feature_label": "Routes",
  "community_id": 4943,
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
