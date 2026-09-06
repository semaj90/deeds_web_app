# Governed Compute Fabric

## ADDED Requirements

### Requirement: Kernel and orchestration backends preserve Atlas authority

AtlasKernelWorker MUST be a budgeted computation/evaluation worker using admitted
skills and the authenticated host bridge, not an agent-memory or canonical mutation owner.
Orchestration/checkpoint backends MUST use existing workflow coordinates and action identity.

#### Scenario: A backend stores a checkpoint
- **WHEN** a Mastra or LangGraph backend suspends execution
- **THEN** its checkpoint is backend state referenced through Atlas contracts, not new run identity

#### Scenario: A kernel skill requests durable mutation
- **WHEN** a computation proposes an action affecting canonical stores
- **THEN** the host's existing schema, lineage and authorization gates apply

#### Scenario: Legacy nested tests are considered
- **WHEN** a historical E2E task proposes direct writes or independent score fusion
- **THEN** root mutation/fusion owners govern adaptation and the nested task grants no authority


### Requirement: Governed Compute Fabric stays evidence-bound and non-destructive
The system MUST keep governed compute fabric actions identity-qualified, non-destructive, and traceable to real evidence rather than assumed or fabricated state.

#### Scenario: An action under this proposal is planned or executed
- **WHEN** a component covered by this proposal runs
- **THEN** it records real evidence (source, revision, or receipt) for what it did, and never silently promotes unproven state to canonical/production status.

#### Scenario: Evidence is missing or unproven
- **WHEN** the required upstream evidence, gate, or dependency is absent or not yet proven
- **THEN** the component fails closed (skips, blocks, or flags) rather than fabricating a result.
