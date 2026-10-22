## ADDED Requirements

### Requirement: Diagnostic repair candidates require a complete, checksum-bound baseline
The system SHALL create repair candidates only from a checker run whose completion receipt matches the exact log checksum,
records an accepted exit code, and has diagnostic counts consistent with the parsed log. An incomplete or mismatched run
MUST remain diagnostic-only and MUST NOT enter ranking or model context.

#### Scenario: Partial or mismatched baseline is rejected
- **WHEN** the checker times out, is interrupted, exits abnormally, has no matching receipt, or its parsed counts differ
- **THEN** the run is marked incomplete and contributes no repair candidates

### Requirement: Recommendations are transparent and evidence-bound
The system SHALL rank repair recommendations using a versioned, inspectable baseline over diagnostic repetition,
revision-qualified source and AST evidence, dependency impact, and testability. A score MUST be labeled advisory and
MUST NOT claim probability of success. An untrained or synthetic low-rank scorer, clustering result, PageRank score,
or model output MUST NOT be presented as validated repair quality.

#### Scenario: Candidate rank can be explained
- **WHEN** a repair candidate is ranked
- **THEN** its input evidence, feature values, ranking method, and score basis are included in the review receipt
- **AND** unknown or missing evidence is represented as unknown rather than inferred

### Requirement: Repair handoffs are proposal-only until human approval
The system SHALL provide a bounded, checksummed handoff containing the diagnostic, verified source evidence, applicable
reference guidance, proposed strategy, allowed file scope, and validation steps. Generating a recommendation or model
proposal MUST NOT edit source files, schedule work, or write to a canonical store.

#### Scenario: Unqualified evidence blocks a handoff
- **WHEN** source identity or revision does not match, or AST analysis is partial
- **THEN** that evidence is excluded, the blocker is recorded, and no repair-ready handoff is produced

#### Scenario: Valid handoff still requires approval
- **WHEN** all evidence checks pass and a repair proposal is emitted
- **THEN** the proposal remains review-only and no source or datastore mutation occurs before explicit human approval

### Requirement: OpenSpec progress XP is receipt-derived and non-authoritative
The system SHALL award progress XP only from an existing, independently verifiable task receipt tied to an OpenSpec task
identifier and a reviewed NES-LUT prompt reference. XP MUST remain a display-only progress measure and MUST NOT affect
repair ranking, model training labels, evidence authority, or task admission.

#### Scenario: Missing or invalid receipt earns no XP
- **WHEN** a task is marked complete without a valid receipt or the receipt fails checksum or acceptance checks
- **THEN** no XP is awarded

#### Scenario: XP cannot influence repair decisions
- **WHEN** repair candidates are ranked or training examples are selected
- **THEN** XP values are not consumed as ranking features, labels, confidence, or admission evidence
