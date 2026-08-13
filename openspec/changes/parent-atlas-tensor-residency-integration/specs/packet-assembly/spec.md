# Packet Assembly Specification

## Logical ordering

Physical completion order is not semantic order. Every pass result SHALL carry a revision-qualified envelope and be joined by canonical identity.

Required fields:

- request_id
- packet_key
- workspace_revision
- source_revision
- representation_revision when relevant
- graph_revision when relevant
- producer / producer_revision
- pass_name / pass_revision
- ordering_scope
- sequence_number only when the payload itself is chunk-ordered
- input_hash
- output_hash
- schema_version
- idempotency_key

## Cluster packet materialization

Cluster summaries produced by `graphify-som-cluster-summaries.mjs` SHALL be
materialized into canonical ACE packets through a pure builder, then committed
to Postgres first.

Cluster packet requirements:

- input source is `cluster:summary:{clusterId}` from Valkey
- builder validates the summary record before any write
- deterministic identity depends on the cluster summary key, workspace revision,
  source revision, graph revision, cluster id, centroid lineage, and
  representation revision
- Postgres remains the canonical commit target
- Valkey is only a warm/readback mirror
- Qdrant and Neo4j may consume the packet later, but they do not define its identity

The newer Atlas vector-selection slice sits underneath this assembler as a
supporting layer only. It is now wired into the packet consumer result as an
additive feature matrix and does not alter assembly ownership. It adds:

- `src/lib/server/atlas/vector/ace-packet-vector.ts`
- `src/lib/server/atlas/vector/turbovec-interpolation.ts`
- `src/lib/server/atlas/ranking/packet-feature-matrix.ts`

ACE compatibility re-exports remain in place, but the canonical owner for the
vector slice is now `src/lib/server/atlas/`.

Proof gate for this lane:

- build
- validate
- Postgres commit
- Postgres readback
- Valkey warm
- Valkey readback
- canonical hash comparison
- replay the same input and verify the packet key stays stable
- fail closed if any readback diverges

## Serialization policy

- JSON + simdjson/JSON parser: small control messages.
- MessagePack: optional compact dynamic control messages.
- Protobuf/gRPC: optional typed process boundary.
- Arrow IPC: bulk columnar/tensor artifacts.
- Base64/hex: debug/text-boundary encodings only.

## QUIC analogy

The assembler borrows QUIC's principle that transport arrival may be unordered while logical identity/order remain explicit. This specification does not require a QUIC transport migration.
