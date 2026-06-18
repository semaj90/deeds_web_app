# Live Service Env Report

Generated: 2026-06-18T14:36:58.695Z

## Summary

- READY: 4
- ENV_MISMATCH: 2
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
| Go Retrieval (HTTP) | ENV_MISMATCH | localhost:8100 | 4ms | RETRIEVAL_HTTP_URL=http://localhost:8100 |
| Go Retrieval (gRPC) | ENV_MISMATCH | localhost:50053 | 2ms | RETRIEVAL_GRPC_URL=127.0.0.1:50053 |

## Provenance

- spine: source_ref -> parent_atlas_documents -> feature_id -> atlas_feature_map -> qdrant_point_id -> route_runtime_packets -> retrieval_telemetry -> go_retrieval_service -> neo4j contextual tree
- qdrant_backfill_ready: yes
- qdrant_backfill_blockers: none
- qdrant_backfill_notes: Qdrant backfill can proceed read-only from provenance sources

## Retrieval Telemetry

- status: READY
- detail: retrieval_telemetry rows=179, recent24h=25
- total rows: 179
- recent 24h rows: 25
- rows with selected_packet_keys: 179
- rows with feature_ids: 179
- rows with retrieval_strategy: 179
- latest at: Wed Jun 17 2026 18:12:39 GMT-0700 (Pacific Daylight Time)

## Notes

- This report is read-only.
- READY means the env and probe match the expected local lane.
- PORT_MISMATCH means the env points at the wrong port for the local lane.
- ENV_MISMATCH means the env points at the wrong host or is malformed.
- SERVICE_STOPPED means the env looks right but the service is not accepting TCP connections.
- AUTH_REQUIRED means the service is reachable but the configured credentials are missing for the secured lane.
- SOURCE_UNAVAILABLE means the env input could not be resolved.
