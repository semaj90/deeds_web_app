# Qdrant / Postgres Mirror Reconciliation

Generated: 2026-06-21T21:07:47.682Z
Status: IN_SYNC
Collection: codebase_chunks_768
Apply requested: yes

## Summary

- canonical rows: 5702
- qdrant points scanned: 250
- joinable points: 243
- orphan points: 7
- agreement before: 243
- agreement after: 243
- suggested patches: 0
- applied patches: 0

## Field Coverage

| field | canonical | payload-present | matched | mismatched | deferred |
|---|---:|---:|---:|---:|---:|
| source_ref | 243 | 243 | 243 | 0 | 0 |
| feature_id | 243 | 243 | 243 | 0 | 0 |
| packet_key | 0 | 212 | 0 | 0 | 0 |
| metadata | 243 | 243 | 243 | 0 | 0 |
| cluster_id | 243 | 243 | 243 | 0 | 0 |
| community_id | 0 | 232 | 0 | 0 | 0 |
| topology_label | 0 | 0 | 0 | 0 | 0 |
| ontology_label | 0 | 0 | 0 | 0 | 0 |
| cluster_key | 0 | 189 | 0 | 0 | 0 |
| kmeans_cluster | 243 | 243 | 243 | 0 | 0 |
| domain | 243 | 243 | 243 | 0 | 0 |
| som_cluster | 243 | 243 | 243 | 0 | 0 |

## Sample Orphans

- 2316000 (not joinable to canonical Postgres spine)
- 2968749 (not joinable to canonical Postgres spine)
- 3305298 (not joinable to canonical Postgres spine)
- 7660230 (not joinable to canonical Postgres spine)
- 11034662 (not joinable to canonical Postgres spine)
- 11915146 (not joinable to canonical Postgres spine)
- 14544441 (not joinable to canonical Postgres spine)

## Patch Candidates

- none

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

Keep the payload lane read-only; the current canonical rows are already aligned with Qdrant for the checked fields.

