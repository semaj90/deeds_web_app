# Qdrant/Postgres Identity Mismatch Debug Report

**Date**: 2026-06-14T17:26:23.017Z
**Gate**: Sampled Agreement >= 95%
**Result**: ❌ FAIL

## Summary

| Metric | Value |
|--------|-------|
| Sampled packets | 50 |
| Matched | 40 (80.0%) |
| Mismatched | 10 (20.0%) |
| Postgres missing | 0 |

## Top Mismatches


### 1. src/lib/server/ai/contextual-tools.ts
**Reason**: 1 field(s) mismatch

```json
{
  "qdrant": {
  "qdrant_point_id": 174637,
  "source_ref": "src/lib/server/ai/contextual-tools.ts",
  "packet_key": null,
  "feature_id": "ai",
  "feature_label": "lib",
  "payload_keys": [
    "chunk_id",
    "sourceRef",
    "file_path",
    "root",
    "area",
    "kind",
    "tags",
    "agent_area",
    "feature_status",
    "centroid_id",
    "content_hash",
    "schema_version",
    "feature_label",
    "phase_lane",
    "dependency_cluster",
    "hot_keyword_cluster",
    "parent_atlas_card_id",
    "file_name",
    "extension",
    "chunk_index",
    "total_chunks",
    "content",
    "purpose",
    "domain",
    "complexity",
    "indexed_at",
    "gpuCluster",
    "somRow",
    "somCol",
    "som_cluster",
    "gpu_cluster",
    "sourceRefs",
    "source_refs",
    "feature_ids",
    "lane_ids",
    "som_cell",
    "feature_id",
    "cluster_id",
    "cluster_k",
    "som_bmu_row",
    "som_bmu_col",
    "vector64",
    "indexed_at_som",
    "graphAuthorityScore",
    "communityId",
    "communitySize",
    "pagerank",
    "cluster_key",
    "canonicalSourceRef",
    "sourceRefHash",
    "encoded_at",
    "source_ref",
    "metadata"
  ]
},
  "postgres": {
  "packet_id": "3c68bfbc43a1edeb18b1ab80e8b348c26a8981f12e8e815ff467b7a1b65c6a4d",
  "source_ref": "src/lib/server/ai/contextual-tools.ts",
  "packet_key": "src/lib/server/ai/contextual-tools.ts:b65c6a4d",
  "feature_id": "ai",
  "feature_label": "lib",
  "community_id": null,
  "community_confidence": null
},
  "fields_differ": packet_key
}
```


### 2. src/lib/server/research/reddit-harvester.ts
**Reason**: 1 field(s) mismatch

```json
{
  "qdrant": {
  "qdrant_point_id": 188608,
  "source_ref": "src/lib/server/research/reddit-harvester.ts",
  "packet_key": null,
  "feature_id": "research",
  "feature_label": "lib",
  "payload_keys": [
    "chunk_id",
    "sourceRef",
    "file_path",
    "root",
    "area",
    "kind",
    "tags",
    "agent_area",
    "feature_status",
    "centroid_id",
    "content_hash",
    "schema_version",
    "feature_label",
    "phase_lane",
    "dependency_cluster",
    "hot_keyword_cluster",
    "parent_atlas_card_id",
    "file_name",
    "extension",
    "chunk_index",
    "total_chunks",
    "content",
    "purpose",
    "domain",
    "complexity",
    "indexed_at",
    "gpuCluster",
    "somRow",
    "somCol",
    "som_cluster",
    "gpu_cluster",
    "sourceRefs",
    "source_refs",
    "feature_ids",
    "lane_ids",
    "som_cell",
    "feature_id",
    "graphAuthorityScore",
    "encoded_at",
    "communitySize",
    "pagerank",
    "cluster_key",
    "cluster_id",
    "cluster_k",
    "som_bmu_row",
    "som_bmu_col",
    "vector64",
    "indexed_at_som",
    "canonicalSourceRef",
    "sourceRefHash",
    "communityId",
    "source_ref",
    "metadata"
  ]
},
  "postgres": {
  "packet_id": "5358d6af1e964d5b5d920cba9e39f15e821b66fbbccdf9d26c3fd02478eef6c1",
  "source_ref": "src/lib/server/research/reddit-harvester.ts",
  "packet_key": "src/lib/server/research/reddit-harvester.ts:78eef6c1",
  "feature_id": "research",
  "feature_label": "lib",
  "community_id": null,
  "community_confidence": null
},
  "fields_differ": packet_key
}
```


### 3. src/lib/server/couchdb/mango-indexes.ts
**Reason**: 1 field(s) mismatch

```json
{
  "qdrant": {
  "qdrant_point_id": 227675,
  "source_ref": "src/lib/server/couchdb/mango-indexes.ts",
  "packet_key": null,
  "feature_id": "couchdb",
  "feature_label": "lib",
  "payload_keys": [
    "chunk_id",
    "sourceRef",
    "file_path",
    "root",
    "area",
    "kind",
    "tags",
    "agent_area",
    "feature_status",
    "centroid_id",
    "content_hash",
    "schema_version",
    "feature_label",
    "phase_lane",
    "dependency_cluster",
    "hot_keyword_cluster",
    "parent_atlas_card_id",
    "file_name",
    "extension",
    "chunk_index",
    "total_chunks",
    "content",
    "purpose",
    "domain",
    "complexity",
    "indexed_at",
    "gpuCluster",
    "somRow",
    "somCol",
    "som_cluster",
    "gpu_cluster",
    "sourceRefs",
    "source_refs",
    "feature_ids",
    "lane_ids",
    "som_cell",
    "feature_id",
    "cluster_id",
    "cluster_k",
    "som_bmu_row",
    "som_bmu_col",
    "vector64",
    "indexed_at_som",
    "canonicalSourceRef",
    "sourceRefHash",
    "encoded_at",
    "source_ref",
    "metadata"
  ]
},
  "postgres": {
  "packet_id": "a7cfb7216cf09ac9a28bd6e2b9f50cfdee5002da2bd2f1b755df2341dff1fbc9",
  "source_ref": "src/lib/server/couchdb/mango-indexes.ts",
  "packet_key": "src/lib/server/couchdb/mango-indexes.ts:dff1fbc9",
  "feature_id": "couchdb",
  "feature_label": "lib",
  "community_id": null,
  "community_confidence": null
},
  "fields_differ": packet_key
}
```


### 4. src/lib/server/data/legal-seed-data.ts
**Reason**: 1 field(s) mismatch

```json
{
  "qdrant": {
  "qdrant_point_id": 404803,
  "source_ref": "src/lib/server/data/legal-seed-data.ts",
  "packet_key": null,
  "feature_id": "data",
  "feature_label": "lib",
  "payload_keys": [
    "chunk_id",
    "sourceRef",
    "file_path",
    "root",
    "area",
    "kind",
    "tags",
    "agent_area",
    "feature_status",
    "centroid_id",
    "content_hash",
    "schema_version",
    "feature_label",
    "phase_lane",
    "dependency_cluster",
    "hot_keyword_cluster",
    "parent_atlas_card_id",
    "file_name",
    "extension",
    "chunk_index",
    "total_chunks",
    "content",
    "purpose",
    "domain",
    "complexity",
    "indexed_at",
    "gpuCluster",
    "somRow",
    "somCol",
    "som_cluster",
    "gpu_cluster",
    "sourceRefs",
    "source_refs",
    "feature_ids",
    "lane_ids",
    "som_cell",
    "feature_id",
    "cluster_id",
    "cluster_k",
    "som_bmu_row",
    "som_bmu_col",
    "vector64",
    "indexed_at_som",
    "graphAuthorityScore",
    "communityId",
    "communitySize",
    "pagerank",
    "cluster_key",
    "canonicalSourceRef",
    "sourceRefHash",
    "encoded_at",
    "source_ref",
    "metadata"
  ]
},
  "postgres": {
  "packet_id": "a7dec133453f92169e30618f7e5ff88a8f61f635146d5282d0e1e91f1ec45097",
  "source_ref": "src/lib/server/data/legal-seed-data.ts",
  "packet_key": "src/lib/server/data/legal-seed-data.ts:1ec45097",
  "feature_id": "data",
  "feature_label": "lib",
  "community_id": null,
  "community_confidence": null
},
  "fields_differ": packet_key
}
```


### 5. src/lib/components/citations/citationsaveform.svelte
**Reason**: 1 field(s) mismatch

```json
{
  "qdrant": {
  "qdrant_point_id": 436451,
  "source_ref": "src/lib/components/citations/citationsaveform.svelte",
  "packet_key": null,
  "feature_id": "citations",
  "feature_label": "lib",
  "payload_keys": [
    "chunk_id",
    "sourceRef",
    "file_path",
    "root",
    "area",
    "kind",
    "tags",
    "agent_area",
    "feature_status",
    "centroid_id",
    "content_hash",
    "schema_version",
    "feature_label",
    "phase_lane",
    "dependency_cluster",
    "hot_keyword_cluster",
    "parent_atlas_card_id",
    "file_name",
    "extension",
    "chunk_index",
    "total_chunks",
    "content",
    "purpose",
    "domain",
    "complexity",
    "indexed_at",
    "sourceRefs",
    "source_refs",
    "feature_id",
    "related_feature_ids",
    "cluster_id",
    "som_cluster",
    "feature_ids",
    "lane_ids",
    "gpuCluster",
    "somRow",
    "somCol",
    "gpu_cluster",
    "som_cell",
    "cluster_k",
    "som_bmu_row",
    "som_bmu_col",
    "vector64",
    "indexed_at_som",
    "graphAuthorityScore",
    "communityId",
    "communitySize",
    "pagerank",
    "cluster_key",
    "canonicalSourceRef",
    "sourceRefHash",
    "encoded_at",
    "source_ref",
    "metadata"
  ]
},
  "postgres": {
  "packet_id": "6b682bba77747499fef5bfb0583fef87b91e7612fd6bcda8f78fe7ae77b10257",
  "source_ref": "src/lib/components/citations/citationsaveform.svelte",
  "packet_key": "src/lib/components/citations/citationsaveform.svelte:77b10257",
  "feature_id": "citations",
  "feature_label": "lib",
  "community_id": null,
  "community_confidence": null
},
  "fields_differ": packet_key
}
```


### 6. src/lib/server/retrieval/cluster-aware-reranker.ts
**Reason**: 1 field(s) mismatch

```json
{
  "qdrant": {
  "qdrant_point_id": 1116368,
  "source_ref": "src/lib/server/retrieval/cluster-aware-reranker.ts",
  "packet_key": null,
  "feature_id": "retrieval",
  "feature_label": "lib",
  "payload_keys": [
    "chunk_id",
    "sourceRef",
    "file_path",
    "root",
    "area",
    "kind",
    "tags",
    "agent_area",
    "feature_status",
    "centroid_id",
    "content_hash",
    "schema_version",
    "feature_label",
    "phase_lane",
    "dependency_cluster",
    "hot_keyword_cluster",
    "parent_atlas_card_id",
    "file_name",
    "extension",
    "chunk_index",
    "total_chunks",
    "content",
    "purpose",
    "domain",
    "complexity",
    "indexed_at",
    "gpuCluster",
    "somRow",
    "somCol",
    "som_cluster",
    "gpu_cluster",
    "sourceRefs",
    "source_refs",
    "feature_ids",
    "lane_ids",
    "som_cell",
    "feature_id",
    "cluster_id",
    "cluster_k",
    "som_bmu_row",
    "som_bmu_col",
    "vector64",
    "indexed_at_som",
    "graphAuthorityScore",
    "communityId",
    "communitySize",
    "pagerank",
    "cluster_key",
    "canonicalSourceRef",
    "sourceRefHash",
    "encoded_at",
    "source_ref",
    "metadata"
  ]
},
  "postgres": {
  "packet_id": "5aca4923e925c29dee33105a38850266e7e1ac2091be4a78669b515295647aa7",
  "source_ref": "src/lib/server/retrieval/cluster-aware-reranker.ts",
  "packet_key": "src/lib/server/retrieval/cluster-aware-reranker.ts:95647aa7",
  "feature_id": "retrieval",
  "feature_label": "lib",
  "community_id": null,
  "community_confidence": null
},
  "fields_differ": packet_key
}
```


### 7. src/lib/server/admin/retrieval-analytics-service.ts
**Reason**: 1 field(s) mismatch

```json
{
  "qdrant": {
  "qdrant_point_id": 1146202,
  "source_ref": "src/lib/server/admin/retrieval-analytics-service.ts",
  "packet_key": null,
  "feature_id": "admin",
  "feature_label": "lib",
  "payload_keys": [
    "chunk_id",
    "sourceRef",
    "file_path",
    "root",
    "area",
    "kind",
    "tags",
    "agent_area",
    "feature_status",
    "centroid_id",
    "content_hash",
    "schema_version",
    "feature_label",
    "phase_lane",
    "dependency_cluster",
    "hot_keyword_cluster",
    "parent_atlas_card_id",
    "file_name",
    "extension",
    "chunk_index",
    "total_chunks",
    "content",
    "purpose",
    "domain",
    "complexity",
    "indexed_at",
    "som_cluster",
    "gpu_cluster",
    "feature_ids",
    "lane_ids",
    "feature_id",
    "cluster_id",
    "cluster_k",
    "som_bmu_row",
    "som_bmu_col",
    "vector64",
    "indexed_at_som",
    "graphAuthorityScore",
    "encoded_at",
    "communitySize",
    "pagerank",
    "cluster_key",
    "canonicalSourceRef",
    "sourceRefHash",
    "communityId",
    "source_ref",
    "metadata"
  ]
},
  "postgres": {
  "packet_id": "b2b991a4a785fdaa9b5b441890758a55e2500a4fb7e072f2f300a33c8f0ca91b",
  "source_ref": "src/lib/server/admin/retrieval-analytics-service.ts",
  "packet_key": "src/lib/server/admin/retrieval-analytics-service.ts:8f0ca91b",
  "feature_id": "admin",
  "feature_label": "lib",
  "community_id": null,
  "community_confidence": null
},
  "fields_differ": packet_key
}
```


### 8. src/lib/components/graph/glyphatlasviewer.svelte
**Reason**: 1 field(s) mismatch

```json
{
  "qdrant": {
  "qdrant_point_id": 2211723,
  "source_ref": "src/lib/components/graph/glyphatlasviewer.svelte",
  "packet_key": null,
  "feature_id": "graph",
  "feature_label": "lib",
  "payload_keys": [
    "chunk_id",
    "sourceRef",
    "file_path",
    "root",
    "area",
    "kind",
    "tags",
    "agent_area",
    "feature_status",
    "centroid_id",
    "content_hash",
    "schema_version",
    "feature_label",
    "phase_lane",
    "dependency_cluster",
    "hot_keyword_cluster",
    "parent_atlas_card_id",
    "file_name",
    "extension",
    "chunk_index",
    "total_chunks",
    "content",
    "purpose",
    "domain",
    "complexity",
    "indexed_at",
    "sourceRefs",
    "source_refs",
    "feature_id",
    "related_feature_ids",
    "som_cluster",
    "gpu_cluster",
    "feature_ids",
    "lane_ids",
    "cluster_id",
    "cluster_k",
    "som_bmu_row",
    "som_bmu_col",
    "vector64",
    "indexed_at_som",
    "canonicalSourceRef",
    "sourceRefHash",
    "encoded_at",
    "source_ref",
    "metadata"
  ]
},
  "postgres": {
  "packet_id": "14d50570-c1e7-4376-9aba-50ccc590fca2",
  "source_ref": "src/lib/components/graph/glyphatlasviewer.svelte",
  "packet_key": "src/lib/components/graph/glyphatlasviewer.svelte:c590fca2",
  "feature_id": "graph",
  "feature_label": "lib",
  "community_id": null,
  "community_confidence": null
},
  "fields_differ": packet_key
}
```


### 9. sveltekit-frontend/src/routes/api/sse/chat/+server.ts
**Reason**: 1 field(s) mismatch

```json
{
  "qdrant": {
  "qdrant_point_id": 2216567,
  "source_ref": "sveltekit-frontend/src/routes/api/sse/chat/+server.ts",
  "packet_key": "src/routes/api/sse/chat/+server.ts:4697545054664a70",
  "feature_id": "chat",
  "feature_label": "Chat",
  "payload_keys": [
    "chunk_id",
    "sourceRef",
    "file_path",
    "root",
    "area",
    "kind",
    "tags",
    "agent_area",
    "feature_status",
    "centroid_id",
    "content_hash",
    "schema_version",
    "source_ref",
    "phase_lane",
    "dependency_cluster",
    "hot_keyword_cluster",
    "parent_atlas_card_id",
    "file_name",
    "extension",
    "chunk_index",
    "total_chunks",
    "content",
    "purpose",
    "domain",
    "complexity",
    "indexed_at",
    "gpuCluster",
    "somRow",
    "somCol",
    "som_cluster",
    "gpu_cluster",
    "sourceRefs",
    "source_refs",
    "feature_ids",
    "lane_ids",
    "som_cell",
    "feature_id",
    "route_path",
    "concept_ids",
    "cluster_k",
    "som_bmu_row",
    "som_bmu_col",
    "vector64",
    "indexed_at_som",
    "graphAuthorityScore",
    "communityId",
    "communitySize",
    "pagerank",
    "cluster_key",
    "canonicalSourceRef",
    "sourceRefHash",
    "encoded_at",
    "community_conf",
    "packet_key",
    "atlas_enriched",
    "atlas_enriched_at",
    "community_id",
    "path",
    "hash",
    "mtime",
    "packetKey",
    "ontology",
    "domain_confidence",
    "domain_id",
    "domain_parent",
    "canonical_source_ref",
    "filePath",
    "lineage_version",
    "feature_label"
  ]
},
  "postgres": {
  "packet_id": "9f47b9e5c251cecb1323914a72d98a3ed4b6d1d9857096fa684e2c9444ab2ff1",
  "source_ref": "sveltekit-frontend/src/routes/api/sse/chat/+server.ts",
  "packet_key": "src/routes/api/sse/chat/+server.ts:d33bf81bce04d644",
  "feature_id": "chat",
  "feature_label": "Chat",
  "community_id": 17,
  "community_confidence": 1
},
  "fields_differ": packet_key
}
```


### 10. src/lib/server/kb/rerank-weight-loader.ts
**Reason**: 1 field(s) mismatch

```json
{
  "qdrant": {
  "qdrant_point_id": 2437269,
  "source_ref": "src/lib/server/kb/rerank-weight-loader.ts",
  "packet_key": null,
  "feature_id": "kb",
  "feature_label": "lib",
  "payload_keys": [
    "chunk_id",
    "sourceRef",
    "file_path",
    "root",
    "area",
    "kind",
    "tags",
    "agent_area",
    "feature_status",
    "centroid_id",
    "content_hash",
    "schema_version",
    "feature_label",
    "phase_lane",
    "dependency_cluster",
    "hot_keyword_cluster",
    "parent_atlas_card_id",
    "file_name",
    "extension",
    "chunk_index",
    "total_chunks",
    "content",
    "purpose",
    "domain",
    "complexity",
    "indexed_at",
    "gpuCluster",
    "somRow",
    "somCol",
    "som_cluster",
    "gpu_cluster",
    "sourceRefs",
    "source_refs",
    "feature_ids",
    "lane_ids",
    "som_cell",
    "feature_id",
    "cluster_id",
    "cluster_k",
    "som_bmu_row",
    "som_bmu_col",
    "vector64",
    "indexed_at_som",
    "canonicalSourceRef",
    "sourceRefHash",
    "encoded_at",
    "source_ref",
    "metadata"
  ]
},
  "postgres": {
  "packet_id": "b12f7ab6-3cda-45ab-a461-1e6872809bdc",
  "source_ref": "src/lib/server/kb/rerank-weight-loader.ts",
  "packet_key": "src/lib/server/kb/rerank-weight-loader.ts:72809bdc",
  "feature_id": "kb",
  "feature_label": "lib",
  "community_id": null,
  "community_confidence": null
},
  "fields_differ": packet_key
}
```


## Recommendations


❌ Identity drift detected.

**Actions required**:
1. Investigate mismatch causes above
2. Fix Postgres/Qdrant sync in ingest pipeline
3. Recalibrate packet_key computation
4. Re-sample and revalidate before enrichment

**DO NOT**:
- Train autoencoder (learns corrupted identity)
- Deploy SOM clustering (inherits mismatches)
- Reindex Karpathy authority (will amplify drift)


## Root Cause Categories


The mismatches fall into categories:

1. **Postgres missing**: Qdrant has packets Postgres doesn't
   - Likely cause: Orphaned Qdrant points from failed ingestion
   - Fix: Delete orphaned points OR ingest missing packets

2. **Field mismatch**: Both have packet, but fields differ
   - Likely cause: Different canonicalization rules
   - Fix: Align ingest normalization logic

3. **packet_key mismatch**: Hash differs (identity)
   - Likely cause: Different hash algorithm versions
   - Fix: Recompute hashes with canonical algorithm



---

**Conclusion**: System needs identity fixes before enrichment.
