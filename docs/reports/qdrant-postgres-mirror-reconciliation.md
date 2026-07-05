# Qdrant / Postgres Mirror Reconciliation

Generated: 2026-07-04T18:29:13.121Z
Status: IN_SYNC
Collection: codebase_chunks_768
Apply requested: no

## Summary

- canonical rows: 58144
- qdrant points scanned: 250
- joinable points: 0
- orphan points: 250
- agreement before: 0
- agreement after: 0
- suggested patches: 0
- applied patches: 0

## Field Coverage

| field | canonical | payload-present | matched | mismatched | deferred |
|---|---:|---:|---:|---:|---:|
| source_ref | 0 | 0 | 0 | 0 | 0 |
| feature_id | 0 | 0 | 0 | 0 | 0 |
| packet_key | 0 | 0 | 0 | 0 | 0 |
| metadata | 0 | 0 | 0 | 0 | 0 |
| cluster_id | 0 | 0 | 0 | 0 | 0 |
| community_id | 0 | 0 | 0 | 0 | 0 |
| topology_label | 0 | 0 | 0 | 0 | 0 |
| ontology_label | 0 | 0 | 0 | 0 | 0 |
| cluster_key | 0 | 0 | 0 | 0 | 0 |
| kmeans_cluster | 0 | 0 | 0 | 0 | 0 |
| domain | 0 | 0 | 0 | 0 | 0 |
| som_cluster | 0 | 0 | 0 | 0 | 0 |

## Sample Orphans

- 990761 (not joinable to canonical Postgres spine)
- 1576768 (not joinable to canonical Postgres spine)
- 1636755 (not joinable to canonical Postgres spine)
- 2434769 (not joinable to canonical Postgres spine)
- 4006069 (not joinable to canonical Postgres spine)
- 4180125 (not joinable to canonical Postgres spine)
- 4261983 (not joinable to canonical Postgres spine)
- 5166037 (not joinable to canonical Postgres spine)

## Patch Candidates

- none

## Gemma4 Context Visibility

- feature_id: MISSING (sveltekit-frontend.EvidencePrimaryUpload)
- source_ref: MISSING (sveltekit-frontend/src/lib/components/evidence/EvidencePrimaryUpload.svelte)
- metadata: VISIBLE ([object Object])
- packet_key: VISIBLE (packet:12dfac568730)
- cluster_id: MISSING
- community_id: VISIBLE (38514)
- topology_label: MISSING
- ontology_label: MISSING
- cluster_key: MISSING
- kmeans_cluster: MISSING
- som_cluster: MISSING
- domain: VISIBLE (classification failed)
- qdrant_tag_id: DEFERRED
- karpathy_score: DEFERRED
- redis_hot_key: DEFERRED
- neo4j_node: DEFERRED

## Next Safe Action

Keep the payload lane read-only; the current canonical rows are already aligned with Qdrant for the checked fields.

