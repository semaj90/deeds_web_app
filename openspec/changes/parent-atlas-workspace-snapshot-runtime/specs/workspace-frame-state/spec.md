# Workspace frame validity, currentness, and admission

## ADDED Requirements

### Requirement: Workspace frame state keeps validity, currentness, and admission independent

The workspace snapshot runtime MUST represent immutable snapshot validity, currentness at the time of evaluation, and admission as separate facts. A valid or admitted snapshot MUST NOT be treated as current solely because it is the latest available receipt. A current snapshot MUST NOT be treated as admitted without the exact admission record. The state MUST bind `workspaceRevision`, `snapshotRevision`, `manifestSha256`, and the successful validation receipt checksum. An evaluation MUST record the current workspace revision against which currentness was assessed.

The normalized state MUST expose:

- `snapshotValid`: immutable manifest and independent validation readback agree;
- `currentAtEvaluation`: evaluated workspace revision equals the observed current workspace revision;
- `admitted`: an append-only admission record matches the snapshot, workspace revision, manifest checksum, source count, and validation receipt;
- `admissionMode`: `CURRENT_WORKSPACE`, `PRIOR_IMMUTABLE_SNAPSHOT`, or `null`;
- `supersededByWorkspaceRevision`: the observed current revision when a valid admitted snapshot is no longer current.

#### Scenario: A valid admitted snapshot is superseded by workspace edits

- **WHEN** the immutable snapshot and validation receipt still verify, its admission record binds the exact snapshot, and a fresh evaluation observes a different workspace revision
- **THEN** the snapshot remains `snapshotValid=true` and `admitted=true`
- **AND** `currentAtEvaluation=false`, `admissionMode=PRIOR_IMMUTABLE_SNAPSHOT`, and `supersededByWorkspaceRevision` names the observed revision
- **AND** consumers requiring current-workspace evidence reject it while consumers explicitly requesting that historical snapshot may use it

#### Scenario: Currentness is not admission

- **WHEN** the observed workspace revision matches a valid snapshot but no exact append-only admission record exists
- **THEN** `snapshotValid=true`, `currentAtEvaluation=true`, and `admitted=false`
- **AND** no consumer may infer admission from currentness

#### Scenario: Historical snapshot identity is missing or mismatched

- **WHEN** a historical read does not name an exact snapshot revision, or its manifest/validation/admission checksums disagree
- **THEN** the request fails closed
- **AND** it MUST NOT silently substitute the current workspace frame

### Requirement: Projection freshness is derived separately from workspace authority

Projection freshness MUST identify the projection artifact, its source workspace revision, the observed current workspace revision, and its status (`CURRENT`, `WORKSPACE_SUPERSEDED`, `SOURCE_CHANGED`, `REPRESENTATION_CHANGED`, or `OWNER_UNKNOWN`). A stale projection MUST remain distinguishable from an invalid snapshot or revoked admission. Freshness evaluation MUST be read-only and MUST NOT update or promote projections.

#### Scenario: Projection is bound to an older admitted workspace

- **WHEN** a projection binds a valid admitted prior snapshot and the current workspace revision differs
- **THEN** freshness is `WORKSPACE_SUPERSEDED`
- **AND** the historical source snapshot remains independently addressable
- **AND** no automatic refresh or write is triggered

### Requirement: Runtime facade normalizes existing owner state without taking authority

The Parent Atlas runtime facade MUST normalize snapshot validation, admission, Graphify execution, semantic representation, projection freshness, and ACE/BitFrost status through adapters over their existing owners. The facade is a read/control projection and MUST NOT create admission, canonical identity, or projection freshness authority. SSR MAY provide initial read state; SSE MAY carry progress/status deltas only. Browser state and IndexedDB MUST NOT determine validity, currentness, admission, or revision identity.

#### Scenario: UI receives runtime status

- **WHEN** the Admin Studio loads or receives an SSE update
- **THEN** displayed fields retain the underlying owner and revision/checksum references
- **AND** the UI cannot promote, admit, or rewrite canonical workspace state
