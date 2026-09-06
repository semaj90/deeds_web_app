# Agentic Run Receipts Bound to OpenSpec Changes

## ADDED Requirements

### Requirement: Checkpoint bindings reuse workflow identity and coordinates

Backend checkpoints MUST bind to WorkflowActionEventV1 identity and existing
WorkflowExecutionCoordinatesV1. They MUST NOT establish AgentRunSnapshotV1 or
another canonical run receipt schema.

#### Scenario: A workflow resumes from a backend checkpoint
- **WHEN** a checkpoint is admitted for a retry or resume
- **THEN** workflow/action identity, coordinates and authorization remain bound
- **AND** mismatched checkpoint identity is rejected

#### Scenario: A checkpoint reference appears missing
- **WHEN** an adapter needs additional checkpoint metadata
- **THEN** existing evidenceRefs/artifactRefs and coordinate coverage are audited before extension


### Requirement: Agentic Run Receipt Binding stays evidence-bound and non-destructive
The system MUST keep agentic run receipt binding actions identity-qualified, non-destructive, and traceable to real evidence rather than assumed or fabricated state.

#### Scenario: An action under this proposal is planned or executed
- **WHEN** a component covered by this proposal runs
- **THEN** it records real evidence (source, revision, or receipt) for what it did, and never silently promotes unproven state to canonical/production status.

#### Scenario: Evidence is missing or unproven
- **WHEN** the required upstream evidence, gate, or dependency is absent or not yet proven
- **THEN** the component fails closed (skips, blocks, or flags) rather than fabricating a result.
