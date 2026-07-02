# Qdrant / Postgres Mirror Reconciliation

Generated: 2026-07-02T03:46:01.937Z
Status: RECONCILED
Collection: codebase_chunks_768
Apply requested: yes

## Summary

- canonical rows: 58298
- qdrant points scanned: 500
- joinable points: 445
- orphan points: 55
- agreement before: 444
- agreement after: 445
- suggested patches: 1
- applied patches: 1

## Field Coverage

| field | canonical | payload-present | matched | mismatched | deferred |
|---|---:|---:|---:|---:|---:|
| source_ref | 445 | 445 | 445 | 0 | 0 |
| feature_id | 445 | 445 | 444 | 1 | 0 |
| packet_key | 445 | 445 | 444 | 1 | 0 |
| metadata | 445 | 445 | 444 | 1 | 0 |
| cluster_id | 0 | 0 | 0 | 0 | 0 |
| community_id | 0 | 0 | 0 | 0 | 0 |
| topology_label | 0 | 0 | 0 | 0 | 0 |
| ontology_label | 0 | 0 | 0 | 0 | 0 |
| cluster_key | 0 | 0 | 0 | 0 | 0 |
| kmeans_cluster | 0 | 0 | 0 | 0 | 0 |
| domain | 0 | 0 | 0 | 0 | 0 |
| som_cluster | 0 | 37 | 0 | 0 | 0 |

## Sample Orphans

- 00537352-b039-45bf-9009-b44d4ccf337d (not joinable to canonical Postgres spine)
- 0062a661-a993-4cfc-9e86-0bc1785dd997 (not joinable to canonical Postgres spine)
- 006960bb-8d3a-49e1-8c9b-ee1a8138111f (not joinable to canonical Postgres spine)
- 00865f5e-a81d-454a-b60a-ad66b5781146 (not joinable to canonical Postgres spine)
- 008a52ea-f999-4d9e-8b3e-7acad60238d9 (not joinable to canonical Postgres spine)
- 0096d303-1566-4c9b-9686-46fb24d70eba (not joinable to canonical Postgres spine)
- 00a5ac67-62a0-4539-b8dd-65d5f9714135 (not joinable to canonical Postgres spine)
- 00abe2b4-f279-4aff-8b28-1c39e429a60d (not joinable to canonical Postgres spine)

## Patch Candidates

- 01c6caaa-1cbd-4b92-a488-e6b6c17385de: feature_id, packet_key, metadata

## Gemma4 Context Visibility

- feature_id: VISIBLE (sveltekit-frontend.EvidencePrimaryUpload)
- source_ref: VISIBLE (sveltekit-frontend/src/lib/components/evidence/EvidencePrimaryUpload.svelte)
- metadata: VISIBLE ([object Object])
- packet_key: VISIBLE (packet:12dfac568730)
- cluster_id: MISSING
- community_id: MISSING
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

Backfill the Qdrant payload fields from the canonical Postgres spine using the apply alias, then rerun the audit.

