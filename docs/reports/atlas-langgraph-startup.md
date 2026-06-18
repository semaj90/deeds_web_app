# Atlas Diagnostic & Startup Report

**Generated:** `2026-06-18T00:07:52.008Z`

## Database Integrity & Coverage

| Store / Service | Connection | Details / Counts |
| :--- | :--- | :--- |
| **PostgreSQL** | `healthy` | 0 packets (Avg reward: 0) |
| **Qdrant** | `healthy` | 52606 points |
| **Redis (Valkey)** | `healthy` | Centroids: 85, Temporals: 5 |
| **Neo4j** | `healthy` | Packets: 8798, Concepts: 3208, Edges: 73263 |

## Lane Completion Status

| Lane / Phase | Target Gate | Status |
| :--- | :--- | :--- |
| Lineage Mapping (P0) | Lineage Verification passes | `IN_PROGRESS` |
| Packet Contract (P0) | Postgres schema + indices check | `IN_PROGRESS` |
| Ranking Signal (P2) | BM25 & Concept coverage PASS | `IN_PROGRESS` |
| MCP Tooling | Postgres & Qdrant synced | `COMPLETE` |
| Contextual Graph (P1) | Neo4j projection edges exist | `COMPLETE` |

## Taskboard Status

- **Open Tasks:** 105
- **Completed Tasks:** 56
