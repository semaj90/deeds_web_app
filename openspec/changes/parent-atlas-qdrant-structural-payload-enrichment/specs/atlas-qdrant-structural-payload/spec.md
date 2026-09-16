## ADDED Requirements

### Requirement: Structural payload fields are additive only
The system SHALL add new AST/CST-derived fields to the `codebase_chunks_768` Qdrant payload
without modifying, renaming, or removing any existing field written by `buildQdrantSyncPayload()`.

#### Scenario: Existing field untouched
- **WHEN** a structural-enrichment `setPayload` call is made against a point
- **THEN** every pre-existing payload field on that point (including `canonical_id`,
  `source_ref`, `workspace_id`, `workspace_revision`, `topo_class`, `som_cluster`,
  `graphAuthorityScore`) retains its prior value unchanged

### Requirement: Structural fields sourced only from the existing AstGrepObservationV1 contract
The system SHALL derive structural payload fields exclusively from the existing
`AstGrepObservationV1` evidence contract (`packages/parent-atlas/src/core/ast-grep-observation-adapter.ts`),
never from a newly invented or duplicate AST evidence path.

#### Scenario: No duplicate AST evidence pipeline
- **WHEN** implementing the structural payload writer
- **THEN** the writer imports and reuses `AstGrepObservationV1` rather than re-parsing source with
  a separate ast-grep/Tree-sitter invocation

### Requirement: No canonical identity change
The system SHALL NOT alter canonical packet, chunk, or workspace identity as part of structural
payload enrichment.

#### Scenario: Identity fields immutable
- **WHEN** a structural-enrichment write is applied
- **THEN** `canonical_id`, `canonical_source_ref`, `source_ref_key`, and `packet_key` fields on the
  target point are not modified by this capability
