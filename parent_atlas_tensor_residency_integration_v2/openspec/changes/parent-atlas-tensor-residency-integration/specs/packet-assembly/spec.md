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

## Serialization policy

- JSON + simdjson/JSON parser: small control messages.
- MessagePack: optional compact dynamic control messages.
- Protobuf/gRPC: optional typed process boundary.
- Arrow IPC: bulk columnar/tensor artifacts.
- Base64/hex: debug/text-boundary encodings only.

## QUIC analogy

The assembler borrows QUIC's principle that transport arrival may be unordered while logical identity/order remain explicit. This specification does not require a QUIC transport migration.
