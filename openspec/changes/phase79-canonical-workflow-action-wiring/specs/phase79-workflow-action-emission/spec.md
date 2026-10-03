## ADDED Requirements

### Requirement: Phase 79 emits a canonical WorkflowActionEventV1 for every authorized repair attempt outcome
Every call to `processOneSuggestion()` in apply mode (not dry-run) that reaches a terminal outcome
(`applied === true` or `applied === false` after a caught failure) SHALL attempt to construct and
persist a canonical `WorkflowActionEventV1` describing that outcome, in addition to the existing
`analysis_pass_results` write. This SHALL be additive observability only -- it SHALL NOT alter
Phase 79's existing `--apply`/`--dry-run` gating, risk-level gating, source-mutation logic, or
rollback behavior.

#### Scenario: A repair attempt succeeds and its analysis_pass_results write persisted
- **WHEN** `persistRepairEpisode()` returns `{ persisted: true, rowId }` for a `status: 'succeeded'`
  repair attempt
- **THEN** a `WorkflowActionEventV1` with `kind: 'completed'` and `receiptId` set to `String(rowId)`
  SHALL be constructed and persisted via `writeCanonicalWorkflowActionAtomically()`

#### Scenario: A repair attempt succeeds but its analysis_pass_results write did not persist
- **WHEN** `persistRepairEpisode()` returns `{ persisted: false, reason }` for a `status: 'succeeded'`
  repair attempt
- **THEN** no canonical `WorkflowActionEventV1` SHALL be constructed for that attempt, and the
  skip SHALL be recorded with reason `NO_RECEIPT_ID_AVAILABLE_LEDGER_NOT_PERSISTED` rather than a
  fabricated `receiptId`

#### Scenario: A repair attempt fails
- **WHEN** a repair attempt's `status` is `'failed'`
- **THEN** a `WorkflowActionEventV1` with `kind: 'failed'` SHALL be constructed with `errorCode`
  derived from the real caught failure message (its leading colon-delimited token, or
  `'UNKNOWN_FAILURE'` when no failure message is available) and persisted via
  `writeCanonicalWorkflowActionAtomically()`

### Requirement: Canonical event identity fields use real UUIDs and a documented system-tenant sentinel
Because `writeCanonicalWorkflowActionAtomically()` persists through `agent_runs`/`agent_run_actions`
(both `uuid` primary-key columns) via `prepareCanonicalActionWriteV1()`'s UUID enforcement, the
constructed event's `runId` and `actionId` SHALL be freshly generated real UUIDs, distinct from
Phase 79's own human-readable `sessionId` (which SHALL be preserved in `metadata.sessionId`
instead). `tenantId` SHALL be the documented nil-UUID sentinel
(`00000000-0000-0000-0000-000000000000`), since Phase 79 has no real multi-tenant identity.

#### Scenario: The constructed event's runId and actionId are valid UUIDs
- **WHEN** `buildPhase79CanonicalWorkflowActionEvent()` constructs an event
- **THEN** `event.runId` and `event.actionId` SHALL both match the standard UUID format accepted by
  `prepareCanonicalActionWriteV1()`

### Requirement: Construction logic is unit-testable without a live database
The pure construction of a Phase 79 canonical `WorkflowActionEventV1` SHALL live in a module with no
top-level side effects (no DB connection, no required environment variables), separate from
`phase79-agentic-repair.mts` (which executes its full agent loop on import and requires
`DATABASE_URL`), so it can be unit-tested in isolation.

#### Scenario: The builder module is imported without a database connection
- **WHEN** `scripts/phase79-canonical-workflow-action-event.mts` is imported in a test process with
  no `DATABASE_URL` set and no Postgres connection available
- **THEN** the import SHALL succeed and `buildPhase79CanonicalWorkflowActionEvent()` SHALL be
  callable and produce a schema-valid event for realistic succeeded/failed fixture inputs
