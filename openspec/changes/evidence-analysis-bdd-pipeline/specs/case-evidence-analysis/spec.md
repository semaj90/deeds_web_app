## Purpose
Define the authorized investigator journey from case creation to source-grounded evidence analysis.

## ADDED Requirements
### Requirement: Case creation leads to case evidence navigation
After successful case creation, the system SHALL open the created case overview and provide navigation to that case's Evidence Board.

#### Scenario: Newly created case opens its overview
- **WHEN** an authorized user creates a case with valid details
- **THEN** the created case overview SHALL open
- **AND** its navigation SHALL offer the Evidence Board

### Requirement: Empty Evidence Boards guide evidence admission
The system SHALL show a clear empty state and an Add Evidence action within the current case.

#### Scenario: Case contains no evidence
- **WHEN** an investigator opens the empty case Evidence Board
- **THEN** the interface SHALL explain that no exhibits are attached
- **AND** provide Add Evidence without leaving the case

### Requirement: Exhibit analysis is bound to the selected case and revision
The system SHALL show source identity, source revision, processing state, and analysis for the selected authorized exhibit.

#### Scenario: Processed exhibit is opened
- **WHEN** an investigator selects a processed exhibit from the case Evidence Board
- **THEN** the analysis view SHALL identify the same case, exhibit, and source revision

### Requirement: Processing status survives navigation and refresh
The system SHALL render progress from durable job state and SHALL distinguish upload status from analysis status.

#### Scenario: Processing view is refreshed
- **WHEN** an investigator refreshes an exhibit's processing view
- **THEN** the view SHALL resume from durable job status
- **AND** SHALL not create a duplicate analysis job

### Requirement: Timestamped results navigate to original media time
The system SHALL seek using source presentation timestamps and SHALL identify frame findings and transcript segments as unreviewed proposals until review.

#### Scenario: Transcript segment is selected
- **WHEN** an investigator selects a timestamped transcript segment or frame finding
- **THEN** the viewer SHALL seek to that source time and highlight the selected result

### Requirement: Analysis access is case-authorized
The system SHALL check case authorization before disclosing evidence, analysis, cached results, or job progress, and SHALL return the application's not-found response to unauthorized direct requests.

#### Scenario: Unauthorized user requests analysis directly
- **WHEN** a user without case access requests the exhibit analysis view
- **THEN** the application SHALL return not-found
- **AND** SHALL disclose no exhibit, finding, or progress details

### Requirement: Failed analysis does not remove admitted evidence
The system SHALL present upload and analysis outcomes separately and SHALL retain the immutable source when processing fails.

#### Scenario: Analysis job fails after durable upload
- **WHEN** an investigator opens an exhibit whose analysis job failed
- **THEN** upload SHALL remain shown as successful and analysis as failed
- **AND** the failure or a safe retry action SHALL be available
- **AND** original evidence bytes SHALL remain unchanged
