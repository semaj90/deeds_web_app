# Spec: Atlas Envelope Contract (Unordered-Execution Packet Validation)

## ADDED Requirements

### Requirement: Pass results SHALL carry an AtlasEnvelopeV1 identity/lineage envelope
Every asynchronous pass result (NLP sidecar pass, GPU sidecar result, graph
analysis run row, rerank output) that materializes into `atlas_packets` or a
derived store MUST carry `packet_key`, `source_ref`, `workspace_revision`,
`representation_revision`, `producer`, `producer_revision`, `pass_name`,
`pass_revision`, `input_hash`, `output_hash`, `schema_version`, and
`idempotency_key` as defined in design.md D2.

#### Scenario: Two producers finish out of order for the same packet_key
- **WHEN** the MiniLM rerank pass and the AST-extract pass both emit results
  for the same `packet_key`, and MiniLM's HTTP response arrives after AST's
  despite MiniLM being dispatched first
- **THEN** both results are validated and joined by `packet_key`, not by
  arrival order, and the final `FeatureRow` for that `packet_key` is
  identical regardless of which response arrived first

#### Scenario: A stale-revision result arrives after a newer graph snapshot is frozen
- **WHEN** a pass result's `workspace_revision` is older than the currently
  frozen `workspace_revision`
- **THEN** the validator rejects the result as stale (check 4) rather than
  materializing it over the current data

### Requirement: Physical arrival order SHALL NOT be used as materialization order
Consumers joining pass results into a `FeatureRow` or equivalent candidate
structure MUST key the join on canonical identity (`packet_key`) and MUST NOT
sort or gate materialization by the order in which async results arrived.

#### Scenario: A required feature is missing at join time
- **WHEN** a candidate `packet_key` is missing one optional signal (e.g. the
  MiniLM score hasn't arrived yet) at the time the row is materialized
- **THEN** the row is materialized with that feature flagged in
  `missingMask`, not blocked or silently reordered to wait

### Requirement: Duplicate idempotency keys SHALL be rejected as no-ops, not errors
Re-delivery of an already-materialized `(producer, pass_name, packet_key,
input_hash)` result MUST be detected via `idempotency_key` and treated as a
no-op re-materialization, not as a duplicate-row error and not as a silent
overwrite with a different `output_hash` for the same key.

#### Scenario: A sidecar retries a request after a network timeout
- **WHEN** the NLP sidecar's HTTP client retries a pass call after a timeout,
  and the original request actually succeeded server-side
- **THEN** the second (duplicate) result is detected via
  `idempotency_key` and discarded without altering already-materialized state

### Requirement: Stable sort SHALL only apply to already-validated candidate rows
Sorting for presentation/selection (e.g. `score DESC,
canonical_candidate_id ASC`) MUST occur only after the `AtlasEnvelopeValidator`
has validated and joined the underlying rows; sort order MUST NOT be used as
a substitute for identity/revision validation.

#### Scenario: Two candidates tie on score
- **WHEN** two joined candidate rows have identical `score`
- **THEN** the deterministic tie-break (`canonical_candidate_id ASC`)
  produces the same final order on every re-run given the same input set
