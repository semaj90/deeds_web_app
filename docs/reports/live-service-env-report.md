# Live Service Env Report

Generated: 2026-06-12T02:21:55.453Z

## Summary

- READY: 4
- ENV_MISMATCH: 0
- PORT_MISMATCH: 0
- SERVICE_STOPPED: 0
- AUTH_REQUIRED: 0
- SOURCE_UNAVAILABLE: 0

## Services

| service | status | env | probe | detail |
|---|---|---|---|---|
| Postgres 18 | READY | 127.0.0.1:5434 | 2ms | DATABASE_URL=postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db |
| Qdrant | READY | 127.0.0.1:6333 | 1ms | QDRANT_URL=http://127.0.0.1:6333 |
| Neo4j | READY | 127.0.0.1:7687 | 1ms | NEO4J_URI=bolt://127.0.0.1:7687 |
| Redis | READY | 127.0.0.1:6379 | 0ms | REDIS_URL=redis://127.0.0.1:6379 |

## Provenance

- spine: source_ref -> parent_atlas_documents -> feature_id -> atlas_feature_map -> qdrant_point_id -> route_runtime_packets -> neo4j contextual tree
- qdrant_backfill_ready: yes
- qdrant_backfill_blockers: none
- qdrant_backfill_notes: Qdrant backfill can proceed read-only from provenance sources

## Notes

- This report is read-only.
- READY means the env and probe match the expected local lane.
- PORT_MISMATCH means the env points at the wrong port for the local lane.
- ENV_MISMATCH means the env points at the wrong host or is malformed.
- SERVICE_STOPPED means the env looks right but the service is not accepting TCP connections.
- AUTH_REQUIRED means the service is reachable but the configured credentials are missing for the secured lane.
- SOURCE_UNAVAILABLE means the env input could not be resolved.
