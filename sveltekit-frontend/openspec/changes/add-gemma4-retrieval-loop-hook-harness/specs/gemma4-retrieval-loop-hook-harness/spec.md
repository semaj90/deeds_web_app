# Gemma4 Retrieval Loop Hook Harness Spec - 2026-07-30

## ADDED Requirements

### Requirement: Local retrieval-loop hook harness
The system SHALL expose a local-only retrieval-loop hook harness for Gemma4 tool-call events.

#### Scenario: Append a retrieval event
- **WHEN** the hook receives a payload with `query`, `sourceRefs`, `selectedCardIds`, `rerankScore`, `tool`, and `outcome`
- **THEN** it appends one JSONL row to `.tmp/atlas-retrieval-loop.jsonl`
- **AND** the row preserves those fields without rewriting their meaning
- **AND** the hook remains safe to run in dry-run mode

#### Scenario: Smoke validate the harness
- **WHEN** the smoke script runs
- **THEN** it confirms the hook file exists
- **AND** it confirms the local JSONL sink exists
- **AND** it validates that the last appended row contains the required keys

### Requirement: No remote mutation from the hook
The system SHALL NOT use the hook harness to write to Qdrant, Redis publish channels, or any production mutation path.

#### Scenario: Remote writes are blocked
- **WHEN** the hook is invoked
- **THEN** it may append locally and forward to the outcome ledger
- **AND** it must not directly mutate remote retrieval stores

### Requirement: Hook ownership remains narrow
The hook harness SHALL remain a narrow append-and-forward boundary rather than a second retrieval pipeline.

#### Scenario: Other systems consume the hook output
- **WHEN** downstream telemetry or ranking logic reads the hook row
- **THEN** it consumes the JSONL row or outcome ledger entry
- **AND** it does not treat the hook as a canonical retrieval engine
