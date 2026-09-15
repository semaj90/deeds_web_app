## ADDED Requirements

### Requirement: Fanout queries read only resolved, admitted evidence
The fanout storage layer (materialized view + indexes over `feature_ontology_tuples`) SHALL
include only rows with `resolution_state = 'RESOLVED'` that have separately passed
`OntologyFanoutAuthorityV1` admission. It SHALL NOT read or expose `UNRESOLVED` rows.

#### Scenario: Unresolved row excluded
- **WHEN** a `feature_ontology_tuples` row has `resolution_state = 'UNRESOLVED'`
- **THEN** that row does not appear in the fanout materialized view

### Requirement: Bitmap-scan-friendly index layout
The fanout storage layer SHALL provide indexes on `resolved_concept_id`, `subject_id`, and
`packet_key` sufficient for PostgreSQL's query planner to satisfy a concept-to-evidence fanout
query via bitmap index scan(s) combined with `BitmapAnd`/`BitmapOr`, verified via `EXPLAIN`
showing a bitmap scan plan rather than a sequential scan at production row-count scale.

#### Scenario: Concept fanout uses bitmap scan
- **WHEN** a query filters the fanout view by a single `resolved_concept_id` at 500,000+
  underlying row scale
- **THEN** `EXPLAIN` shows a `Bitmap Heap Scan` (not `Seq Scan`) driven by the
  `resolved_concept_id` index

### Requirement: Explicit, bounded staleness
The fanout materialized view SHALL have a documented, explicit refresh cadence and staleness
bound. No caller SHALL be wired to depend on it until that cadence is recorded.

#### Scenario: Refresh cadence documented before first caller
- **WHEN** any new consumer is proposed to read from the fanout view
- **THEN** the refresh cadence and maximum staleness bound must already be documented in this
  capability's implementation record, or the consumer proposal is blocked

### Requirement: No bypass of the existing admission gate
No write path SHALL populate or refresh the fanout storage layer from evidence that has not
passed `OntologyFanoutAuthorityV1` admission.

#### Scenario: Admission gate is not bypassed
- **WHEN** the materialized view refresh runs
- **THEN** its source query filters exclusively on rows already marked admitted by
  `OntologyFanoutAuthorityV1`-gated promotion, never on raw `feature_ontology_tuples` rows
  directly
