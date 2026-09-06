# Packet Assembly Specification

## ADDED Requirements

### Requirement: Logical ordering via revision-qualified envelope
Physical completion order is not semantic order. Every pass result SHALL carry a revision-qualified envelope and be joined by canonical identity, carrying: `request_id`, `packet_key`, `workspace_revision`, `source_revision`, `representation_revision` (when relevant), `graph_revision` (when relevant), `producer`/`producer_revision`, `pass_name`/`pass_revision`, `ordering_scope`, `sequence_number` (only when the payload itself is chunk-ordered), `input_hash`, `output_hash`, `schema_version`, and `idempotency_key`.

#### Scenario: A pass result arrives
- **WHEN** a pass result is produced, regardless of when it physically completes relative to other results
- **THEN** it carries the full revision-qualified envelope (the fields listed above)
- **AND** it is joined into the final state by canonical identity, not by physical arrival order.

### Requirement: Cluster packet materialization is Postgres-first
Cluster summaries produced by `graphify-som-cluster-summaries.mjs` SHALL be materialized into canonical ACE packets through a pure builder, then committed to Postgres first. The input source is `cluster:summary:{clusterId}` from Valkey; the builder validates the summary record before any write; deterministic identity depends on the cluster summary key, workspace revision, source revision, graph revision, cluster id, centroid lineage, and representation revision. Postgres remains the canonical commit target; Valkey is only a warm/readback mirror; Qdrant and Neo4j may consume the packet later but do not define its identity.

#### Scenario: A cluster summary is materialized into a packet
- **WHEN** a cluster summary from `cluster:summary:{clusterId}` in Valkey is materialized into an ACE packet
- **THEN** the builder validates the summary record first, computes identity from the cluster summary key/workspace/source/graph revisions/cluster id/centroid lineage/representation revision, and commits to Postgres before any Valkey/Qdrant/Neo4j write.

#### Scenario: The proof gate for this lane is run
- **WHEN** the packet-assembly proof gate executes for this lane
- **THEN** it runs build, validate, Postgres commit, Postgres readback, Valkey warm, Valkey readback, and canonical hash comparison, then replays the same input to verify the packet key stays stable
- **AND** it fails closed if any readback diverges.
