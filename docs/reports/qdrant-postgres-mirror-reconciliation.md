# Qdrant / Postgres Mirror Reconciliation

Generated: 2026-07-19T23:23:46.843Z
Status: IN_SYNC
Collection: codebase_chunks_768
Apply requested: yes

## Summary

- canonical rows: 58357
- qdrant points scanned: 250
- joinable points: 0
- orphan points: 250
- agreement before: 0
- agreement after: 0
- suggested patches: 0
- applied patches: 0

## Proof

- batching logic: NOT_YET_PROVEN
- full materialization: NOT_YET_PROVEN
- resume semantics: RESUME_SEMANTICS_NOT_YET_PROVEN
- atomic publication: ATOMIC_PUBLICATION_NOT_YET_PROVEN
- qdrant mirror: PROVEN
- identity coverage: STILL_PARTIAL
- proof states: FULL_MATERIALIZATION_NOT_YET_PROVEN, RESUME_SEMANTICS_NOT_YET_PROVEN, ATOMIC_PUBLICATION_NOT_YET_PROVEN, QDRANT_MIRROR_PROVEN, IDENTITY_COVERAGE_STILL_PARTIAL

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
- 1167479 (not joinable to canonical Postgres spine)
- 1181912 (not joinable to canonical Postgres spine)
- 1576768 (not joinable to canonical Postgres spine)
- 1636755 (not joinable to canonical Postgres spine)
- 2021966 (not joinable to canonical Postgres spine)
- 2434769 (not joinable to canonical Postgres spine)
- 3085081 (not joinable to canonical Postgres spine)

## Patch Candidates

- none

## Gemma4 Context Visibility

- feature_id: MISSING (sveltekit-frontend.+page)
- source_ref: MISSING (sveltekit-frontend/src/routes/(app)/demos/+page.svelte)
- metadata: VISIBLE ([object Object])
- packet_key: VISIBLE (packet:1f18437ee58f)
- cluster_id: MISSING
- community_id: VISIBLE (39055)
- topology_label: VISIBLE (Graph)
- ontology_label: MISSING
- cluster_key: MISSING
- kmeans_cluster: MISSING
- som_cluster: MISSING
- domain: VISIBLE (frontend)
- qdrant_tag_id: DEFERRED
- karpathy_score: DEFERRED
- redis_hot_key: DEFERRED
- neo4j_node: DEFERRED

## Next Safe Action

Keep the payload lane read-only; the current canonical rows are already aligned with Qdrant for the checked fields.

