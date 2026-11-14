## Purpose
Define canonical, revision-aware indexing and readback for evidence analysis.

## ADDED Requirements
### Requirement: PostgreSQL owns canonical analysis identity
The system SHALL bind analysis records and vectors to authorized evidence identity, source revision, analysis revision, and exact source locators in PostgreSQL before publishing rebuildable projections.

#### Scenario: Projection receives a stale analysis revision
- **WHEN** a projection event refers to a source or analysis revision that is no longer current
- **THEN** the projection consumer SHALL reject or quarantine the event
- **AND** canonical analysis state SHALL remain unchanged

### Requirement: Vector projections follow the canonical outbox
The system SHALL persist each multimodal embedding as a canonical PostgreSQL 18 pgvector row bound to the installed `public.evidence` identity and a linked modality-specific outbox event in one transaction before publishing that vector to Qdrant. Case authorization SHALL be resolved through the canonical evidence-to-case relationship. Qdrant SHALL remain a rebuildable projection. The text-only `evidence_vectors` and its outbox SHALL retain their text-only contract.

#### Scenario: Multimodal vector is canonical before Qdrant publication
- **WHEN** image, frame, crop, audio, or video-window analysis produces an embedding
- **THEN** the canonical PostgreSQL vector row SHALL bind case/evidence identity, source revision, analysis revision, model and preprocessing revisions, checksums, and an exact source locator
- **AND** a linked projection-outbox event SHALL commit in the same transaction
- **AND** no Qdrant upsert SHALL occur before canonical commit and readback

#### Scenario: Qdrant is unavailable after canonical vector commit
- **WHEN** the Qdrant projection is unavailable or its readback fails
- **THEN** the canonical PostgreSQL vector SHALL remain available
- **AND** the projection event SHALL remain pending or retryable with a visible failure status

#### Scenario: Vector projection is retried
- **WHEN** a projection event is delivered more than once
- **THEN** the projection update SHALL be idempotent for the same source and analysis revision

#### Scenario: Text-only vector contract receives a multimodal input
- **WHEN** a media frame, image crop, audio segment, or video window is submitted to `evidence_vectors`
- **THEN** the write SHALL be rejected by the text-only contract
- **AND** no Qdrant projection event SHALL be emitted

### Requirement: Search and caches are authorization- and revision-scoped
The system SHALL enforce case authorization before retrieval or cache access and SHALL key cached analysis by source and analysis revisions.

#### Scenario: Different source revision is opened
- **WHEN** a user opens a different revision of the same exhibit
- **THEN** results from an earlier revision SHALL not be presented as current
- **AND** unavailable current results SHALL be shown as unavailable

### Requirement: Readback proves indexed evidence lineage
The system SHALL verify that an indexed result resolves to the exact authorized evidence revision and source locator before presenting it as grounded analysis.

#### Scenario: Search result cannot resolve to its source
- **WHEN** an indexed result lacks a valid source binding or exact locator
- **THEN** the result SHALL be excluded from grounded evidence output

### Requirement: Evaluation data preserves source separation
The system SHALL preserve dataset and source lineage when evaluating retrieval or model outputs, and SHALL not treat approximate similarity as source identity.

#### Scenario: Evaluation includes related frames
- **WHEN** retrieval quality is measured over related media
- **THEN** evaluation SHALL retain held-out source separation and report the selected retrieval revision
