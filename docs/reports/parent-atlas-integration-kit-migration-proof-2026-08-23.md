# Parent Atlas integration-kit migration proof

Date: 2026-08-23

Status: `ISOLATED_SCHEMA_PROVEN / CANONICAL_DATA_NOT_POPULATED`

## Target

- Container: `parent-atlas-fanout-proof`
- Host port: `55432`
- PostgreSQL: `18.4`
- Database: `parent_atlas_fanout_proof`
- Shared workstation port `5434`: not touched

## Applied migration

`packages/parent-atlas-workstation-integration-kit/sql/001_parent_atlas_integration_contract.sql`

The migration was applied outside an explicit transaction because its indexes
use `CREATE INDEX CONCURRENTLY`.

## Readback

Tables present:

- `atlas_packets`
- `atlas_representation_records`
- `atlas_projection_ledger`
- `atlas_graph_feature_runs`

Packet indexes read back:

- `atlas_packets_packet_id_uidx`
- `atlas_packets_packet_key_idx`
- `atlas_packets_source_ref_idx`
- `atlas_packets_revision_idx`
- `atlas_packets_domain_artifact_idx`
- `atlas_packets_tags_gin`
- `atlas_packets_concept_ids_gin`

Ledger row counts:

- `atlas_representation_records`: `0`
- `atlas_projection_ledger`: `0`
- `atlas_graph_feature_runs`: `0`

## Promotion boundary

This proves isolated schema applicability and index creation only. It does not
prove source-version joins, symbol-version joins, representation readback, or
Qdrant/Neo4j projection parity. No canonical rows were inserted or backfilled.
