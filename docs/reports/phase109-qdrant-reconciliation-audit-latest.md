# Phase 109 Qdrant 768 Reconciliation Audit

- Run ID: `7adaba9b-00ef-47a3-903a-e4af7d2cf666`
- Collection: `codebase_chunks_768`
- Corpus revision: `unknown`
- Completed: `2026-08-07T00:46:51.507Z`

## Qdrant
- points_count: `0`
- total_points_scanned: `0`
- unique_point_ids: `0`
- duplicate_point_ids: `0`
- duplicate_postgres_mappings: `0`
- duplicate_chunk_mappings: `0`
- duplicate_qdrant_id_mappings: `0`
- unmatched_points: `0`
- ambiguous_points: `0`
- matched_exact: `0`
- matched_chunk: `0`
- matched_path_hash: `0`
- matched_qdrant_id: `0`
- representation_id_distribution: `{}`
- model_revision_distribution: `{}`
- packet_version_distribution: `{}`
- generation_distribution: `{"PREEXISTING_V1":0,"BACKFILL_V2":0,"UUID_POINT_ID":0,"UNKNOWN":0}`

## Postgres
- eligible_rows: `0`
- has_chunk_id: `false`
- has_content_hash: `false`
- has_embedding_normalized: `false`
- has_qdrant_id: `false`

## Vector Parity
- sampled: `0`
- compared: `0`
- failures: `0`
- max_absolute_difference: `n/a`
- mean_absolute_difference: `n/a`
- search_probe: `{"executed":false,"vectorName":null,"topId":null,"topScore":null,"sourceRowRank":null,"sourceRowInTop10":false}`

## Recommendation
- safe_for_retrieval: `false`
- strategy: `RECONCILIATION_REQUIRED`
- reason: DATABASE_URL was not provided

## Blockers
- DATABASE_URL_REQUIRED

## Sample Points
- none
