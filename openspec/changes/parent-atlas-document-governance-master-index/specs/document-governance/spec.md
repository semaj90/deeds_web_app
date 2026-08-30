# Document Governance Specification

## ADDED Requirements

### Requirement: One canonical document-governance owner
The system SHALL maintain one machine-readable document-governance registry that owns current document status, topic ownership, supersession edges, OpenSpec binding, validation state, workflow progress references, and archive eligibility.

#### Scenario: Master TOC is generated
- **WHEN** the master TOC is rebuilt
- **THEN** it SHALL be derived from the canonical registry
- **AND** manually editing the generated TOC SHALL NOT change canonical document state.

### Requirement: Exactly one canonical document per topic
For every governed topic with current documentation, the system SHALL admit at most one `CANONICAL_CURRENT` document.

#### Scenario: Two documents claim the same topic
- **WHEN** two documents are classified `CANONICAL_CURRENT` for the same topic
- **THEN** the registry SHALL mark the topic `CONFLICT`
- **AND** supersession/archive apply SHALL fail closed for that topic.

### Requirement: CLAUDE instruction scope is distinct from supersession
The system SHALL model instruction-file scope/inheritance separately from supersession.

#### Scenario: Scoped CLAUDE adds subtree rules
- **WHEN** a scoped `CLAUDE.md` applies beneath a root instruction file
- **THEN** the relationship SHALL be recorded as scope/inheritance
- **AND** SHALL NOT imply the root file is superseded.

### Requirement: Supersession is explicit and non-destructive by default
A document SHALL become `SUPERSEDED` only when a replacement relationship is explicitly validated.

#### Scenario: Newer file exists
- **WHEN** a newer related document is discovered
- **BUT** no explicit or validated replacement relationship exists
- **THEN** the older document SHALL NOT be automatically superseded.

#### Scenario: Valid supersession
- **WHEN** replacement coverage, references, and validation gates pass
- **THEN** the predecessor MAY be marked `SUPERSEDED`
- **AND** the original file SHALL remain in place until a separate archive apply is authorized.

### Requirement: Implementation-changing consolidation is OpenSpec-bound
A consolidation that changes implementation, canonical architecture, or runtime instructions SHALL reference an OpenSpec change.

#### Scenario: Change lacks tasks
- **WHEN** an implementation-changing consolidation has no `tasks.md`
- **THEN** the workflow SHALL classify it as planning-incomplete
- **AND** SHALL NOT mark implementation complete.

### Requirement: OpenSpec tasks own implementation progress
Implementation progress SHALL be calculated from tracked checkboxes in the bound OpenSpec `tasks.md`.

#### Scenario: Seven of ten tasks complete
- **WHEN** 7 of 10 tracked tasks are checked
- **THEN** displayed progress SHALL be 70%.

### Requirement: Workflow runtime owns ETA
The document-governance system SHALL reuse `WorkflowActionEventV1.progress` for runtime progress, ETA, and confidence.

#### Scenario: No runtime ETA is available
- **WHEN** no current workflow event includes `etaMs`
- **THEN** the UI and generated TOC SHALL display ETA as unavailable
- **AND** SHALL NOT fabricate an ETA from task count.

### Requirement: Agentic run receipts reuse the existing workflow-event owner
The system SHALL finish/reuse the existing agentic-run-to-OpenSpec binding rather than define a parallel receipt identity schema.

#### Scenario: Workflow completes under an OpenSpec change
- **WHEN** a workflow completion is bound to an OpenSpec change
- **THEN** its durable receipt SHALL reference the canonical workflow/action identity
- **AND** the document-governance registry SHALL store only references/rollups, not duplicate event truth.

### Requirement: Archive is gated
A superseded document SHALL be `ARCHIVE_READY` only after replacement, active-reference, OpenSpec, smoke, test, and contradiction gates pass.

#### Scenario: Active instruction still references old document
- **WHEN** an active `CLAUDE.md` or canonical OpenSpec spec still depends on the old path
- **THEN** archive eligibility SHALL be false.

### Requirement: Tang-inspired shortlist remains experimental
The registry SHALL classify `TANG_INSPIRED_LOW_RANK_SHORTLIST` as experimental/non-canonical unless a separate promotion gate proves it.

#### Scenario: Existing read-only shortlist receipt is indexed
- **WHEN** the existing shortlist receipt is discovered
- **THEN** the registry SHALL expose its status and metrics
- **AND** SHALL NOT mark the policy canonical or promoted.

### Requirement: Admin surface is SSR-first and read-only initially
The Parent Atlas admin page SHALL receive document-governance summary data from server-side loading/API and SHALL NOT scan repository files in the browser.

#### Scenario: Admin Atlas first render
- **WHEN** an authenticated operator opens `/admin/atlas`
- **THEN** the page SHALL be renderable from SSR-provided document-governance summary data
- **AND** client-side refresh MAY update that state without changing document governance.

### Requirement: Generated master TOC supports quick retrieval
The generated `docs/MASTER-TOC.md` SHALL expose current canonical topics, active OpenSpec changes, progress, runtime ETA when available, superseded documents, archive readiness, experiments/challengers, and conflicts.

#### Scenario: Future agent starts from master TOC
- **WHEN** an agent needs current documentation state
- **THEN** it SHALL be able to locate the canonical document and bound OpenSpec change without selecting by filename date alone.
