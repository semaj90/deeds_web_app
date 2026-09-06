# Adaptive DAG governance

## ADDED Requirements

### Requirement: Adaptive DAG actions remain revision-qualified
The adaptive DAG MUST preserve declared operator identity, parameter provenance, dependency order, and read/write policy through planning and replay.

#### Scenario: A plan is assembled
- **WHEN** an operator is selected for a DAG node
- **THEN** the plan records its operator identity, declared parameters, dependencies, and execution policy.

#### Scenario: A plan is replayed
- **WHEN** the same frozen inputs and revisions are replayed
- **THEN** the normalized plan and receipt are deterministic, or the replay fails closed.
