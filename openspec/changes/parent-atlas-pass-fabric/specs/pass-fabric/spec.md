# Pass Fabric

## ADDED Requirements

### Requirement: Pass Fabric stays evidence-bound and non-destructive
The system MUST keep pass fabric actions identity-qualified, non-destructive, and traceable to real evidence rather than assumed or fabricated state.

#### Scenario: An action under this proposal is planned or executed
- **WHEN** a component covered by this proposal runs
- **THEN** it records real evidence (source, revision, or receipt) for what it did, and never silently promotes unproven state to canonical/production status.

#### Scenario: Evidence is missing or unproven
- **WHEN** the required upstream evidence, gate, or dependency is absent or not yet proven
- **THEN** the component fails closed (skips, blocks, or flags) rather than fabricating a result.

### Requirement: Staged NLP observations separate execution from admission
The system MUST represent a successfully executed NLP pass as a candidate-only observation without treating execution status as evidence admission or canonical promotion.

#### Scenario: A bounded NLP cohort is frozen before execution
- **WHEN** `buildNlpStagingCohortV1` receives a proposed cohort
- **THEN** it accepts only sizes 8, 16, or 32, requires one exact workspace revision, resolved PacketKeyV2 identities, non-duplicate source references, at least two existing domain-class labels, and an explicit selection-policy revision.
- **AND** it preserves missing source revisions as null with `REVISION_PARTIAL`, sorts packet references deterministically, and seals the cohort checksum.
- **AND** freezing the contract performs no database, cache, projection, or GPU writes and does not execute NLP.

#### Scenario: A staged observation is constructed
- **WHEN** a pass result is prepared for staged observation
- **THEN** it requires a real packet key, preserves absent source/workspace revisions as null, binds explicit producer and pass revisions with deterministic input/output checksums, records execution status separately from `CANDIDATE_ONLY` admission, and declares no canonical authority or writes.

#### Scenario: A pure admission envelope classifies an unpersisted pass result
- **WHEN** `classifyAnalysisPassAdmissionV1` evaluates a pass result without persistence
- **THEN** it reads only the explicit `packetKey`, never derives packet identity from `evidenceId`, a source path, or current rows, and may emit `OBSERVATION_ONLY` with null packet or revision fields.
- **AND** it emits `ELIGIBLE_FOR_REVIEW` only for successful execution with an exact matching `PacketKeyResolutionV2`, exact source/workspace revisions, producer revision, checksums, and source-revision-bound grounded evidence.
- **AND** every envelope declares `canonicalAuthority: false` and `persistenceAuthorized: false`; the classifier never emits `ADMITTED`.

#### Scenario: A staged observation is recorded in the existing pass ledger
- **WHEN** the existing `analysis_pass_results` writer is explicitly invoked in candidate-only mode
- **THEN** the row retains `succeeded` only as its execution status, stores the `CANDIDATE_ONLY` disposition in provenance, and does not emit an integration event or write canonical feature/evidence state.

#### Scenario: A staged observation resolves packet identity
- **WHEN** the existing pass-ledger writer is explicitly invoked in candidate-only mode
- **THEN** it resolves the supplied key to an existing packet row through the existing packet-row resolver, stores only the resolved physical key in the legacy FK column, and records the direct-versus-alias resolution in staged provenance without claiming PacketKeyV2 logical identity; unresolved or mismatched keys fail before ledger selection or insertion.

#### Scenario: Packet identity or execution proof is absent
- **WHEN** the packet key is absent or the pass status is skipped/failed
- **THEN** the persistence adapter emits no staged observation, the pure classifier reports `OBSERVATION_ONLY` for successful but incomplete identity or `REJECTED` for skipped/failed execution, and no fallback identity is derived from evidence IDs, paths, or current rows.
