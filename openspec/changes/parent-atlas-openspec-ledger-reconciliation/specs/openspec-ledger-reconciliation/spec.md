# OpenSpec Ledger Reconciliation Specification

## ADDED Requirements

### Requirement: OpenSpec ledger census is deterministic and read-only

The repository SHALL provide a reproducible inventory of non-archived OpenSpec task ledgers that records the source revision, included roots, exclusions, per-file content checksum, and syntactic task-state counts. Census generation SHALL NOT change task files or persistent application stores.

#### Scenario: Stable source tree

- **WHEN** the census runs twice against the same source revision and unchanged task files
- **THEN** both canonical receipts SHALL have identical checksums
- **AND** neither run SHALL mutate a task ledger or application datastore.

#### Scenario: Archived and nested changes

- **WHEN** the census discovers root and nested OpenSpec changes
- **THEN** it SHALL include non-archived task ledgers according to the declared root policy
- **AND** it SHALL exclude archived changes and identify exclusions in the receipt.

### Requirement: Task state is not evidence of completion

The reconciliation process SHALL treat a task checkbox as workflow state, not proof that its acceptance condition is satisfied. Any completion claim SHALL identify its owner and supporting evidence with relevant revision or time scope; insufficient or conflicting evidence SHALL remain explicitly partial or unproven.

#### Scenario: Checked task without qualifying evidence

- **WHEN** a checked task has no evidence meeting its stated acceptance condition
- **THEN** the reconciliation report SHALL flag the evidence gap
- **AND** SHALL NOT describe the task as proven solely because it is checked.

#### Scenario: Conflicting or stale totals

- **WHEN** a dated summary or generated projection disagrees with a fresh task-file census
- **THEN** the fresh census SHALL be reported with its scope and source revision
- **AND** the older count SHALL be labeled historical or superseded rather than silently reused.

### Requirement: Reconciliation edits preserve task ownership and safety gates

The reconciliation process SHALL update a task only in its owning OpenSpec change and SHALL preserve unresolved gates, historical receipts, and independent authorization boundaries. It SHALL NOT infer permission to mutate canonical stores, delete historical data, retrain models, or promote a representation from task-ledger reconciliation.

#### Scenario: 384 representation retirement

- **WHEN** 384-related tasks span multiple changes or evidence is limited to static coverage or fixtures
- **THEN** the report SHALL keep ownership separated and scope each evidence claim to what was actually checked
- **AND** SHALL leave source lineage, external caller reachability, and promotion gates open unless independently proven.

