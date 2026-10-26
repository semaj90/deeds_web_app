## ADDED Requirements

### Requirement: Runtime log errors are classified before remediation
Each runtime log error or probe failure SHALL be recorded with its evidence source, its classification (server fault, caller fault, historical fixture, expected warning, or unknown), a named existing owner, and a validation gate. A remediation SHALL NOT change canonical data or source files without its owner's approval.

#### Scenario: A logged error is remediated
- **WHEN** a logged error is selected for remediation
- **THEN** its task in `tasks.md` names the log line or probe result, its classification, its owner, and the gate that proves the fix

#### Scenario: A historical or proposal-only record is seen again
- **WHEN** a log record is historical or marked PROPOSAL_ONLY
- **THEN** it is not promoted to a runtime failure, and no repair path accepts it
