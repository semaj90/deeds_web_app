# Capability: KB trace_search canonical join-back

## ADDED Requirements

### Requirement: Use the canonical 768 semantic lane
The system SHALL route `trace_search` through the active 768 semantic collection from the vector registry.

#### Scenario: Canonical lane selection
- **WHEN** `trace_search` runs
- **THEN** it selects the active semantic 768 collection through the registry
- **AND** it does not rely on a legacy hardcoded 384 lane

### Requirement: Join Qdrant results back to Postgres
The system SHALL join trace results back to Postgres before returning content to the caller.

#### Scenario: Successful join-back
- **WHEN** Qdrant returns hits with `source_ref`
- **THEN** the system joins them to Postgres using `source_ref`
- **AND** returns canonical content, summary, and lineage fields

#### Scenario: No join coverage
- **WHEN** no Qdrant hits join to Postgres
- **THEN** the tool fails closed with `CANONICAL_JOIN_BACK_FAILED`

### Requirement: Preserve ANN rank order
The system SHALL preserve original ANN ordering after join-back.

#### Scenario: Ordered hits
- **WHEN** multiple hits join successfully
- **THEN** the returned order matches the original ANN rank order

### Requirement: Prefer source_ref over path
The system SHALL treat `source_ref` as the active identity and only use `path` as a temporary legacy compatibility alias.

#### Scenario: Payload identity
- **WHEN** a Qdrant payload contains `source_ref`
- **THEN** the response exposes `source_ref`
- **AND** downstream callers do not need to infer identity from `path`

### Requirement: Return bounded canonical payloads
The system SHALL return bounded payloads containing canonical text and lineage fields only.

#### Scenario: Bounded content
- **WHEN** trace search returns results
- **THEN** each payload is capped to a bounded content size
- **AND** includes lineage fields such as `source_ref`, `workspace_revision`, and semantic lane metadata
