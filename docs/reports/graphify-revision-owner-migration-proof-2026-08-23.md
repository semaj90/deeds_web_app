# Graphify revision-owner migration proof

Date: 2026-08-23

Status: `ISOLATED_SCHEMA_PROVEN / WRITER_NOT_RUN`

## Target

- Container: `parent-atlas-fanout-proof`
- Host port: `55432`
- PostgreSQL: `18.4`
- Shared workstation port `5434`: not touched

## Applied additive migrations

- `sveltekit-frontend/drizzle/manual/20260822_graphify_revision_authority_v2.sql`
- `sveltekit-frontend/drizzle/manual/20260822_graph_snapshot_revision_owner_v1.sql`

## Readback

Graphify revision fields present:

- `graphify_runs.workspace_revision`
- `graphify_runs.source_manifest_digest`
- `graphify_runs.source_manifest_source_count`
- `graphify_files.code_source_revision`

Graph snapshot revision fields present:

- `atlas_graph_snapshots_v2.workspace_revision`
- `atlas_graph_snapshots_v2.source_inventory_revision`
- `atlas_graph_snapshots_v2.graph_revision`
- `atlas_graph_snapshots_v2.revision_checksum`
- `atlas_graph_nodes_v2.source_revision`

Row counts after migration:

- `graphify_runs`: `0`
- `graphify_files`: `0`
- `atlas_graph_snapshots_v2`: `0`
- `atlas_graph_nodes_v2`: `0`

## Promotion boundary

This proves additive migration compatibility and column readback only. The
Graphify writer, source-manifest completeness, snapshot materialization,
Qdrant lineage, Neo4j fanout, and canonical promotion remain unproven.
