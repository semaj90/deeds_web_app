# Parent Atlas Agentic Completion & Error-Fixing Runtime

## ADDED Requirements

### Requirement: Agentic Completion stays evidence-bound and non-destructive
The system MUST keep agentic completion actions identity-qualified, non-destructive, and traceable to real evidence rather than assumed or fabricated state.

#### Scenario: An action under this proposal is planned or executed
- **WHEN** a component covered by this proposal runs
- **THEN** it records real evidence (source, revision, or receipt) for what it did, and never silently promotes unproven state to canonical/production status.

#### Scenario: Evidence is missing or unproven
- **WHEN** the required upstream evidence, gate, or dependency is absent or not yet proven
- **THEN** the component fails closed (skips, blocks, or flags) rather than fabricating a result.

### Requirement: Completion receipt history is Drizzle-owned and distinct from worker checkpoints
The system MUST keep any durable agentic-completion receipt history in the application-owned Drizzle/PostgreSQL layer, separate from LangGraph checkpoint state. Receipt history records the immutable completion envelope, proof references, controller snapshot/request checksums, lifecycle status, and producer revision; it MUST NOT store hidden reasoning, prompts, credentials, raw terminal output, or checkpoint payloads. A receipt is derived audit evidence, not canonical source/task authority, and receipt persistence remains disabled until its separate migration/apply gate is authorized.

#### Scenario: A completion receipt is proposed for durable history
- **WHEN** a future persistence adapter receives a validated completion receipt
- **THEN** it binds the receipt checksum and request/controller checksums, preserves proof references and `CREATED`/`WIRED`/`PROVEN`/`DONE` status, and records no more than bounded/redacted output metadata.

#### Scenario: A LangGraph checkpoint is available
- **WHEN** workflow checkpoint state exists for the same execution
- **THEN** it remains owned by the checkpoint provider; receipt history stores only an optional external checkpoint reference and never duplicates checkpoint state or treats `thread_id` as canonical run identity.

#### Scenario: Receipt persistence has not been authorized
- **WHEN** no Drizzle migration/apply authorization exists
- **THEN** the system emits or validates receipts in memory only and performs no durable receipt write.
