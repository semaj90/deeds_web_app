# Atlas Diagnostic & Startup Report

**Generated:** `2026-06-13T06:41:16.153Z`

## Database Integrity & Coverage

| Store / Service | Connection | Details / Counts |
| :--- | :--- | :--- |
| **PostgreSQL** | `healthy` | 17136 packets (Avg reward: 0.4526) |
| **Qdrant** | `healthy` | 54448 points |
| **Redis (Valkey)** | `healthy` | Centroids: 0, Temporals: 0 |
| **Neo4j** | `healthy` | Packets: 8484, Concepts: 3186, Edges: 72237 |

## Lane Completion Status

| Lane / Phase | Target Gate | Status |
| :--- | :--- | :--- |
| Lineage Mapping (P0) | Lineage Verification passes | `IN_PROGRESS` |
| Packet Contract (P0) | Postgres schema + indices check | `IN_PROGRESS` |
| Ranking Signal (P2) | BM25 & Concept coverage PASS | `IN_PROGRESS` |
| MCP Tooling | Postgres & Qdrant synced | `COMPLETE` |
| Contextual Graph (P1) | Neo4j projection edges exist | `COMPLETE` |

## Taskboard Status

- **Open Tasks:** 29
- **Completed Tasks:** 12
