## Purpose
Specify source-grounded observations and review for image and video evidence.

## ADDED Requirements
### Requirement: Findings retain exact source locators
Each OCR, caption, or object-detection finding SHALL identify the immutable evidence revision and source hash, and SHALL retain the source image dimensions or video presentation timestamp and original frame dimensions.

#### Scenario: Resized frame detection is mapped to source coordinates
- **WHEN** a detector analyzes a resized or letterboxed frame
- **THEN** stored coordinates SHALL map to the original frame dimensions
- **AND** invalid or out-of-bounds coordinates SHALL be rejected

#### Scenario: Image observation opens its source region
- **WHEN** an authorized reviewer selects an image observation
- **THEN** the viewer SHALL open the same source revision and highlight its source-coordinate region

### Requirement: Model findings remain proposals until reviewed
The system SHALL preserve model output separately from human review decisions and SHALL label unreviewed findings as proposals.

#### Scenario: Reviewer corrects a model finding
- **WHEN** an authorized reviewer accepts, rejects, or corrects a finding
- **THEN** the model output SHALL remain unchanged
- **AND** the review decision SHALL record reviewer, time, and source revision

### Requirement: Generic detections do not assert identity
The system SHALL present a generic `person` detection only as a non-identifying model observation and SHALL NOT infer identity from that label, embeddings, or perceptual hashes.

#### Scenario: Person detection is inspected
- **WHEN** a reviewer opens a generic person detection
- **THEN** the viewer SHALL show the source timestamp and region
- **AND** SHALL not display a confirmed identity

### Requirement: Perceptual hashes are similarity clues only
The system SHALL use dHash only for similarity grouping or deduplication and SHALL use the admitted source hash and revision for source integrity.

#### Scenario: Similar frames have nearby dHash values
- **WHEN** nearby perceptual hashes are shown
- **THEN** they SHALL be labeled as similarity clues
- **AND** SHALL not be represented as proof of source or event identity

### Requirement: Model provenance and budget are visible
The system SHALL retain model, preprocessing, prompt, and sampling-policy revisions for generated findings, and SHALL keep prepared VLM inputs within the configured budget.

#### Scenario: Frame sampling omits frames to satisfy a budget
- **WHEN** the combined text, frame, and output estimate exceeds the configured model input budget
- **THEN** the worker SHALL reduce frames according to a versioned sampling policy
- **AND** omitted frames SHALL not be represented as analyzed
