## ADDED Requirements

### Requirement: Chunk ownership is joined by exact revision-qualified identity, never by path alone
The system SHALL resolve `canonical_chunk_id` for a source-cohort row only via the exact chain
`atlas_workspace_source_bindings` (matched on the currently-admitted `workspace_revision`) →
`source_ref` + `source_revision` → `atlas_packet_chunk_lineage` WHERE `revision_status='PROVEN'`
→ `chunk_row_id` → `codebase_chunk_index.id`. The system SHALL NOT compare a whole-source digest
to a chunk content hash as a substitute join key, and SHALL NOT infer chunk ownership from a
matching file path alone.

#### Scenario: A row with matching path but no PROVEN lineage row is not silently owned
- **WHEN** a cohort row's `source_ref` matches a `codebase_chunk_index` row by path, but no
  corresponding `atlas_packet_chunk_lineage` row with `revision_status='PROVEN'` exists for the
  admitted `workspace_revision` and exact `source_revision`
- **THEN** the row is classified `MISSING_CANONICAL_OWNER`, and `canonical_chunk_id` is left
  `null` — never populated from the path match

#### Scenario: A row with an exact PROVEN lineage chain resolves its canonical chunk id
- **WHEN** a cohort row has an `atlas_workspace_source_bindings` entry at the admitted
  `workspace_revision`, an exact `source_ref`+`source_revision` match, and a `PROVEN`
  `atlas_packet_chunk_lineage` row pointing at a real `codebase_chunk_index.id`
- **THEN** the row is classified `CANONICAL_CHUNK_ID_MATCH` and its resolved `canonical_chunk_id`
  is recorded in the receipt

### Requirement: The join reuses the admitted workspace-frame selector, not a second lookup
The system SHALL resolve "current workspace revision" for the chunk-native join exclusively via
`resolveCurrentWorkspaceFrameV1()` (and `computeWorkspaceFrameAuthorityV1()` to confirm it is
canonically authoritative) rather than re-deriving it from `workspace-revision-tournament-
admission-v1.json` or any other file directly.

#### Scenario: Join refuses to run against a non-authoritative or conflicted frame
- **WHEN** the chunk-native join is invoked and `computeWorkspaceFrameAuthorityV1()` reports
  `frameAuthoritative: false` for the currently-selected frame
- **THEN** the join does not query Postgres and reports a blocked status naming the reason
  (`CURRENT_WORKSPACE_FRAME_UNRESOLVED`, `_CONFLICT`, or `_NON_AUTHORITATIVE`), mirroring the
  same pre-comparison ladder already used by `audit-current-source-cohort-lineage-v1.mjs`

### Requirement: The join is read-only and produces an explicit per-row classification receipt
The system SHALL run the chunk-native lineage join as a read-only audit that classifies every
cohort row into exactly one of: `CANONICAL_CHUNK_ID_MATCH`, `MISSING_CANONICAL_OWNER`,
`MISSING_SOURCE_REVISION`, `SOURCE_REVISION_MISMATCH`, `WORKSPACE_REVISION_MISMATCH`, or
`CANONICAL_CHUNK_ID_MISMATCH`, and SHALL NOT write to `atlas_packet_chunk_lineage` or
`codebase_chunk_index` as part of this classification.

#### Scenario: Every cohort row receives exactly one classification
- **WHEN** the join runs against the bounded cohort
- **THEN** the receipt's per-row list has exactly one classification value per row, and the sum
  of per-classification counts equals the total cohort row count

#### Scenario: Classification run performs zero writes
- **WHEN** the join completes, regardless of how many rows are `MISSING_CANONICAL_OWNER`
- **THEN** `writesPerformed: false` is recorded in the receipt and no target table row changes

### Requirement: Cohort extension to ~128 rows is gated on a clean smaller-cohort result
The system SHALL NOT extend the chunk-native lineage join to the larger (~128-row) deterministic
cohort until the smaller bounded cohort (52 rows, or its re-materialized replacement) reports zero
`MISSING_CANONICAL_OWNER`, `SOURCE_REVISION_MISMATCH`, `WORKSPACE_REVISION_MISMATCH`, and
`CANONICAL_CHUNK_ID_MISMATCH` rows.

#### Scenario: Extension is refused while the smaller cohort still has unresolved rows
- **WHEN** the 52-row (or replacement) cohort's classification receipt has any
  non-`CANONICAL_CHUNK_ID_MATCH` row
- **THEN** a request to extend to the ~128-row cohort is refused with a status naming the
  outstanding classification counts, and no larger-cohort join is executed
