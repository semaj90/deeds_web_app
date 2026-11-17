## Purpose
Define durable, revision-bound media processing for admitted evidence.

## ADDED Requirements
### Requirement: Media analysis is submitted durably
The system SHALL enqueue media analysis through the existing durable job and outbox owner after source admission, and SHALL NOT depend on an upload request remaining alive to finish analysis.

#### Scenario: Upload request ends while analysis remains queued
- **WHEN** an admitted media upload creates an analysis job
- **THEN** the durable job remains available to a worker after the upload request ends
- **AND** a page refresh does not create a duplicate job

### Requirement: Workers validate source identity before processing
The system SHALL verify case authorization, source revision, and source hash when a worker claims a media job.

#### Scenario: Source changes before a queued job is claimed
- **WHEN** a worker claims a job whose source revision or hash no longer matches
- **THEN** the worker SHALL stop before producing derived results
- **AND** the job SHALL report a visible stale-source outcome

### Requirement: Media processing is bounded and restart-safe
The system SHALL enforce configured resource limits and timeouts, persist stage progress, and make retries idempotent by source and processing revision.

#### Scenario: Worker restarts after partial derived output
- **WHEN** a retry encounters output already written for the same source and processing revision
- **THEN** it SHALL reuse or safely replace only that stage's derived output
- **AND** it SHALL NOT duplicate canonical findings or alter original bytes

### Requirement: Silent video is a valid visual-analysis input
The system SHALL allow video frame processing to continue when probing confirms no audio stream, and SHALL mark transcription skipped with a reason.

#### Scenario: Video contains no audio stream
- **WHEN** media probing completes for a valid silent video
- **THEN** visual frame analysis SHALL continue
- **AND** transcription SHALL be marked skipped because no audio stream exists

### Requirement: Processing results are independently readable
The system SHALL publish completion only after derived objects and canonical metadata have been independently read back and verified against the source and processing revisions.

#### Scenario: Derived media readback fails
- **WHEN** a stored thumbnail, frame, or transcript cannot be read back or fails its integrity check
- **THEN** the job SHALL NOT be marked completed
- **AND** the failure SHALL remain inspectable without removing the admitted source
