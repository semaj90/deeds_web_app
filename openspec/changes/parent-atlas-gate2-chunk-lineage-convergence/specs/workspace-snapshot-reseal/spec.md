## ADDED Requirements

### Requirement: Fresh snapshot capture is read-only and independently verifiable
The system SHALL capture a new workspace source snapshot via the existing
`sealSnapshot()`/`validateSnapshot()` contract (`scripts/atlas/lib/workspace-snapshot-capture-v1.mts`)
without performing any database or admission write, and the resulting manifest SHALL be
independently readback-verifiable (`SNAPSHOT_BYTES_READBACK_PROVEN`) before any admission step
runs against it.

#### Scenario: Fresh snapshot passes readback with zero drift
- **WHEN** a new snapshot is sealed and immediately validated via `validateSnapshot()`
- **THEN** the result reports `status: "SNAPSHOT_BYTES_READBACK_PROVEN"` with `exactMatches`
  equal to `sourceCount` and zero entries in `violationCounts`

#### Scenario: Sealing performs no writes
- **WHEN** the re-seal driver runs to completion
- **THEN** no row in `atlas_packets`, `atlas_workspace_source_bindings`,
  `atlas_packet_chunk_lineage`, or `codebase_chunk_index` is created, updated, or deleted, and the
  only filesystem write is the new snapshot manifest under
  `docs/reports/workspace-source-snapshots/`

### Requirement: Admission against a fresh snapshot requires explicit human authorization
The system SHALL NOT admit a new workspace revision as canonical (`workspace-revision-tournament-
admission-v1.json` with `authority: true`) without an explicit human-supplied authorization
matching the existing `approval.confirmation: "AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1"`
contract already used by the current admission receipt.

#### Scenario: Admission attempted without authorization is refused
- **WHEN** the tournament admission step is invoked without the required authorization
  confirmation
- **THEN** no `workspace-revision-tournament-admission-v1.json` update is written, and the
  process reports a blocked/refused status rather than defaulting to an unauthorized admission

#### Scenario: Admission with authorization produces a self-consistent receipt
- **WHEN** the tournament admission step is invoked with explicit human authorization against a
  freshly-sealed, readback-proven snapshot
- **THEN** the resulting admission receipt has `authority: true`, references the fresh
  snapshot's `snapshotRevision`, and `resolveCurrentWorkspaceFrameV1()` resolves it as the sole
  authoritative candidate with `authorityConflict: false` and zero blockers

### Requirement: Single-owner cross-check is re-run against the fresh admission
The system SHALL re-run `audit-workspace-revision-admission-single-owner-v1.mts` against the
fresh admission and report its real result (`WORKSPACE_REVISION_ADMISSION_SINGLE_OWNER_PROVEN` or
`_BLOCKED`) rather than assuming it passes because the snapshot is fresh.

#### Scenario: Single-owner check reflects the fresh chain, not the stale one
- **WHEN** the single-owner audit runs after a fresh admission
- **THEN** its `hygienePass`-derived check is evaluated against the new snapshot's hygiene
  report, not the prior stale one, and the receipt records whichever real status results
