# Patch Tournament Spec

## Requirement: bounded candidate tournament
The system SHALL support a bounded patch tournament for a single existing compile error.

### Scenario: generate three candidates
- **WHEN** a repair run is started for one compile error
- **THEN** the system SHALL produce exactly three candidate patches for the initial slice
- **AND** each candidate SHALL be isolated in its own worktree or equivalent isolated checkout
- **AND** each candidate SHALL preserve its own patch digest, source revision, and run id

## Requirement: proof before ranking
The system SHALL run static and focused validation before a candidate can be ranked.

### Scenario: validate candidates
- **WHEN** a candidate patch is generated
- **THEN** the system SHALL run static checks and targeted tests on that candidate before ranking
- **AND** the system SHALL record validation results with pass/fail evidence
- **AND** candidates that fail validation SHALL remain in the comparison packet but SHALL NOT be promoted

## Requirement: deterministic ranking
The system SHALL rank candidates deterministically from evidence-backed features.

### Scenario: select a winner
- **WHEN** the three candidates have validation results
- **THEN** the system SHALL rank them with a deterministic feature set
- **AND** the system SHALL emit a comparison packet that records why one candidate ranked first
- **AND** the system SHALL NOT auto-apply the winner

## Requirement: recommendation artifact
The system SHALL emit a Kanban-ready recommendation artifact.

### Scenario: publish result
- **WHEN** the tournament completes
- **THEN** the system SHALL write a comparison packet and a Kanban card
- **AND** the system SHALL keep manual approval separate from patch application
- **AND** the system SHALL NOT begin training, preference optimization, or RL in this slice

## Acceptance Criteria
- one compile error only
- three isolated candidate worktrees
- static and focused tests executed for each surviving candidate
- deterministic ranking result recorded
- one ACE comparison packet emitted
- one Kanban result card emitted
- no auto-apply
- no training
