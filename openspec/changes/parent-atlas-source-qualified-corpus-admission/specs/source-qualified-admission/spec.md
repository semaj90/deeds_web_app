# Source-qualified admission (delta)

## ADDED Requirements

### Requirement: Admission classes are not merged
Dependency diagnostics, workspace diagnostics, documentation references, persisted evidence, and admitted evidence SHALL remain distinct admission classes.

#### Scenario: dependency AST fact proposed for admission
- **WHEN** a dependency-source AST fact is proposed for admission
- **THEN** it is rejected unless it carries a workspace binding and persisted readback

### Requirement: Status reflects the strongest proven level
Each milestone SHALL carry the highest of TESTED, DIAGNOSTIC, DRY_RUN, APPLIED, READBACK_PROVEN, and ADMITTED that its evidence proves.

#### Scenario: unit tests only
- **WHEN** only unit tests pass
- **THEN** the status is TESTED, not READBACK_PROVEN or ADMITTED

### Requirement: Unknown provenance is recorded, not fabricated
Historical rows without encoder or revision evidence SHALL be recorded as UNKNOWN.

#### Scenario: historical vector without encoder evidence
- **WHEN** a stored vector has no encoder or source-revision evidence
- **THEN** its provenance is recorded as UNKNOWN and it is not promoted

### Requirement: Vocabularies are typed and separate
Technical domains, product capabilities, ontology concepts, source-domain strings, and reviewed feature labels SHALL have separate owners and typed crosswalks. Name similarity SHALL NOT establish equivalence.

#### Scenario: identical names across vocabularies
- **WHEN** a source-domain string matches a technical-domain name
- **THEN** no mapping is created until a reviewed crosswalk records it

### Requirement: Diagnostic coverage has a finite frozen denominator
The bounded scan SHALL reconcile exact source identities and revisions against a checksummed selected-source manifest. Cursor exhaustion alone SHALL NOT establish complete coverage. Provider completion and recoverable syntax diagnostics SHALL be counted separately.

#### Scenario: final page has a missing source
- **WHEN** the cursor is exhausted but a selected manifest source has no verified provider receipt
- **THEN** coverage remains partial and the missing source is reported

#### Scenario: retrying an incomplete page
- **WHEN** successful peers have unchanged exact snapshot bytes, workspace/source revisions, provider statuses, and independently verified receipt checksums
- **THEN** those peers are reused without calling their providers again; failed or stale observations are not reused

#### Scenario: finite diagnostics finish
- **WHEN** every selected source has verified diagnostic readback, cursor continuity holds, and there are no missing or duplicate identities
- **THEN** the scan stops and emits per-file outcomes and consolidated totals without claiming durable AST indexing or admission
