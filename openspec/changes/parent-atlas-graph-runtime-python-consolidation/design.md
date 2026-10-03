## Context

`GraphExecutionReceipt` V1 is already consumed by the compatibility runtime. The graph-runtime review needs to test stronger provenance without changing V1 semantics or routing. The NetworkX runtime remains a CPU oracle; canonical graph relationships and production PageRank ownership stay with their existing owners.

## Goals / Non-Goals

**Goals:** Define an additive V2 receipt using the existing V1 field names, plus explicit executor and SHA-256 input/output provenance. Provide a pure V1-to-V2 wrapper requiring the provenance values from the caller and focused compatibility tests.

**Non-Goals:** Do not dispatch algorithms through V2, alter V1, add graph identity, claim CPU/GPU/Neo4j parity, or contact/mutate a datastore.

## Decisions

- Keep the existing `GraphExecutionReceipt` as V1 and introduce `GraphExecutionReceiptV2` beside it. Shared fields retain identical names and meaning so test consumers can compare them directly.
- Require non-empty `executor_revision` and lowercase `sha256:` checksums with 64 hexadecimal digits. The wrapper receives these as evidence; it does not derive or invent them.
- V2 always records `canonical_authority=false` and `writes_performed=false`; a V1 receipt that claims canonical authority is rejected.
- Keep this as a contract/fixture test only. Live executor selection and parity remain separate OpenSpec gates.

## Risks / Trade-offs

- **Risk:** A test DTO could be mistaken for a live V2 execution path. → Keep conversion explicit, do not call it from `typed_graph_runtime.py`, and document the fixture-only status.
- **Risk:** Executor revision strings can be descriptive rather than immutable. → V2 records the supplied value but does not claim that it is content-addressed; callers must provide a verified revision before any live-admission gate.
