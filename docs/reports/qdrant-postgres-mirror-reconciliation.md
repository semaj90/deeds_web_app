# Qdrant / Postgres Mirror Reconciliation

Generated: 2026-06-21T17:17:26.776Z
Status: RECONCILIATION_REQUIRED
Collection: codebase_chunks_768
Apply requested: no

## Summary

- canonical rows: 3281
- qdrant points scanned: 250
- joinable points: 187
- orphan points: 63
- agreement before: 0
- agreement after: 0
- suggested patches: 187
- applied patches: 0

## Field Coverage

| field | canonical | payload-present | matched | mismatched | deferred |
|---|---:|---:|---:|---:|---:|
| source_ref | 187 | 187 | 185 | 2 | 0 |
| feature_id | 187 | 187 | 140 | 47 | 0 |
| packet_key | 0 | 156 | 0 | 0 | 0 |
| metadata | 187 | 187 | 31 | 156 | 0 |
| cluster_id | 187 | 130 | 66 | 121 | 0 |
| community_id | 0 | 176 | 0 | 0 | 0 |
| topology_label | 0 | 0 | 0 | 0 | 0 |
| ontology_label | 0 | 0 | 0 | 0 | 0 |
| cluster_key | 0 | 148 | 0 | 0 | 0 |
| kmeans_cluster | 187 | 0 | 0 | 187 | 0 |
| domain | 187 | 187 | 187 | 0 | 0 |
| som_cluster | 187 | 187 | 31 | 156 | 0 |

## Sample Orphans

- 86694 (not joinable to canonical Postgres spine)
- 138065 (not joinable to canonical Postgres spine)
- 614211 (not joinable to canonical Postgres spine)
- 639944 (not joinable to canonical Postgres spine)
- 1937330 (not joinable to canonical Postgres spine)
- 2306238 (not joinable to canonical Postgres spine)
- 2316000 (not joinable to canonical Postgres spine)
- 2761508 (not joinable to canonical Postgres spine)

## Patch Candidates

- 174637: metadata, cluster_id, kmeans_cluster, som_cluster
- 188608: metadata, cluster_id, kmeans_cluster, som_cluster
- 194586: feature_id, metadata, kmeans_cluster, som_cluster
- 227675: metadata, cluster_id, kmeans_cluster, som_cluster
- 292522: metadata, cluster_id, kmeans_cluster, som_cluster
- 404803: metadata, cluster_id, kmeans_cluster, som_cluster
- 436451: source_ref, metadata, cluster_id, kmeans_cluster, som_cluster
- 727645: metadata, cluster_id, kmeans_cluster, som_cluster

## Gemma4 Context Visibility

- feature_id: VISIBLE (database)
- source_ref: VISIBLE (feature:database)
- metadata: VISIBLE ([object Object])
- packet_key: VISIBLE ($lib/utils/file-reader.ts)
- cluster_id: VISIBLE (4)
- community_id: MISSING
- topology_label: MISSING
- ontology_label: MISSING
- cluster_key: MISSING
- kmeans_cluster: VISIBLE (4)
- som_cluster: VISIBLE (4)
- domain: VISIBLE (source)
- qdrant_tag_id: DEFERRED
- karpathy_score: DEFERRED
- redis_hot_key: DEFERRED
- neo4j_node: DEFERRED

## Next Safe Action

Backfill the Qdrant payload fields from the canonical Postgres spine using the apply alias, then rerun the audit.

