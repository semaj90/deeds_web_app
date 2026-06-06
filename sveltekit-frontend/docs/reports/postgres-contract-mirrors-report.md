# Postgres Contract Mirrors

Generated: 2026-06-06T01:46:58.125Z

## Inputs

- drizzle SQL: drizzle
- Drizzle schema TS: src/lib/server/db
- schema-postgres.ts: src/lib/server/db/schema-postgres.ts
- live Postgres: reachable

## Summary

- tables audited: 8
- live reachable: yes
- classification counts: {"LIVE_DB_ALIGNED":8}

## Table Mirror Status

| Table | Classification | Live | Schema files | SQL files | Column diff | Index diff |
| --- | --- | --- | --- | --- | --- | --- |
| task_semantic_packets | LIVE_DB_ALIGNED | PRESENT | 1 | 5 | clean | clean |
| parent_atlas_jobs | LIVE_DB_ALIGNED | PRESENT | 1 | 1 | clean | clean |
| atlas_feature_map | LIVE_DB_ALIGNED | PRESENT | 1 | 2 | clean | clean |
| parent_atlas_documents | LIVE_DB_ALIGNED | PRESENT | 1 | 1 | clean | clean |
| atlas_feature_map_synthesized | LIVE_DB_ALIGNED | PRESENT | 1 | 1 | clean | clean |
| route_runtime_packets | LIVE_DB_ALIGNED | PRESENT | 1 | 1 | clean | clean |
| nes_chrom_packets | LIVE_DB_ALIGNED | PRESENT | 1 | 4 | clean | clean |
| nes_chrom_kag_dag_hits | LIVE_DB_ALIGNED | PRESENT | 1 | 3 | clean | clean |

## Non-Green Details


## Notes

- SQL_ONLY means the manual sidecar exists without a Drizzle schema mirror.
- DRIZZLE_ONLY means the Drizzle schema exists without a manual SQL mirror.
- LIVE_DB_ALIGNED means the live table matched the mirror definitions.
- COLUMN_MISMATCH and INDEX_MISMATCH are hard contract drift signals.
- SCHEMA_AND_SQL_ALIGNED is used when the static mirrors agree but the live DB is not available.
- Primary-key indexes are ignored in live comparisons because they are implicit, not contract drift.
