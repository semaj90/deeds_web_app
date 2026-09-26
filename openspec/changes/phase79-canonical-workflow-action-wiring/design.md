# Design: Phase 79 canonical WorkflowActionEventV1 wiring

## Identity mapping decisions (each one a real judgment call, recorded honestly)

`workflowActionEventSchema` requires `workflowId`, `workflowRevision`, `sequence`, `actionId`,
`dagNodeId`, `attempt`, `lane`, `kind`, `producerRevision`. Phase 79 has no pre-existing DAG/workflow
concept of its own (it is a bounded single-file repair loop, not a graph executor), so every one of
these had to be assigned rather than round-tripped from an existing local shape.

| Field | Value | Rationale |
|---|---|---|
| `workflowId` | `phase79-repair:${suggestion.id}` | Each repair attempt on a given `error_suggestions` row is treated as its own workflow instance. |
| `workflowRevision` | `0` | No revision concept exists; Phase 79 attempts are not re-run under revision numbers. |
| `sequence` | `0` | Exactly one action per workflow instance (no sub-steps modeled). |
| `actionId` | fresh `randomUUID()` | **Must be a real UUID** -- `canonical-action-write-adapter-v1.ts`'s `prepareCanonicalActionWriteV1` enforces this (becomes `agent_run_actions.action_id`, a `uuid` column). |
| `runId` | fresh `randomUUID()` | Same UUID constraint (`agent_runs.run_id`). Distinct from Phase 79's own human-readable `sessionId` (`phase79:<uuid>`), which is kept in `metadata.sessionId` instead. |
| `dagNodeId` | constant `'phase79.repair-attempt'` | Names the one operation-class Phase 79 always executes; not a real DAG node in any graph. |
| `attempt` | `1` | Phase 79 does not retry within one `processOneSuggestion()` call. |
| `lane` | `'tool'` | Best fit among `WORKFLOW_ACTION_LANES` -- matches `recordAnalysisPassResult()`'s own `passType: 'tool_execution'` framing. |
| `kind` | `'completed'` or `'failed'` | Maps directly from Phase 79's existing `status: 'succeeded' | 'failed'`. |
| `producerRevision` | `PHASE79_PASS_REVISION` (`'phase79-agentic-repair.v2'`) | Already exists in the script; reused verbatim. |

## `receiptId` / `errorCode` (the schema's `superRefine` constraints)

- `kind: 'completed'` requires `receiptId`. Phase 79 has no independent governed-mutation receipt
  (that's `REPAIR-MUTATION-OWNER-BINDING-01`'s job, out of scope here). The only real, durable
  identity available at that point is the `analysis_pass_results` row id returned by
  `recordAnalysisPassResult()` (already called in `persistRepairEpisode()`). `receiptId` is set to
  that row id **only when that write actually persisted** (`ledgerResult.persisted === true`).
  If it did not persist (e.g. `CANONICAL_PACKET_KEY_UNPROVEN`, `ANALYSIS_PASS_RESULTS_UNAVAILABLE`),
  there is no honest `receiptId` to supply -- the builder returns `{ skipped: true, reason:
  'NO_RECEIPT_ID_AVAILABLE_LEDGER_NOT_PERSISTED' }` instead of fabricating one. This is a real,
  disclosed gap, not a workaround: some successful repairs will not get a canonical event.
- `kind: 'failed'` requires `errorCode`. Derived from the real thrown-error message's leading token
  (e.g. `"VERIFICATION_NOT_IMPROVED:before=3/1:after=3/1"` -> `"VERIFICATION_NOT_IMPROVED"`), which
  Phase 79 already produces as structured, colon-delimited error strings throughout
  `processOneSuggestion()`. Falls back to `'UNKNOWN_FAILURE'` only when `failureReason` is `null`.

## `tenantId` (`agent_runs.tenant_id` is `uuid NOT NULL`)

Phase 79 has no real multi-tenant concept -- this is a single-tenant, repo-wide tool. No existing
production caller in this repo has established a "system tenant" convention (checked: only test
fixtures use a non-UUID placeholder like `'tenant-1'`, which would fail against the real Postgres
`uuid` column). `PHASE79_SYSTEM_TENANT_ID` uses the RFC 4122 nil UUID
(`00000000-0000-0000-0000-000000000000`) as an explicit, documented sentinel for "system-scoped, no
tenant" -- not a fabricated real identity. **Open question, not resolved here**: whether a future
multi-caller convergence (Phase 78, Kanban, A2A all writing canonical events) should establish a
real shared system-tenant UUID constant instead of each caller picking its own nil-UUID sentinel
independently.

## Persistence path: reuse, not invent

Per this repo's "One Canonical Runtime Owner Per Capability" rule, the existing
`writeCanonicalWorkflowActionAtomically()` (`sveltekit-frontend/src/lib/server/agent/action-writer.ts`,
already tested this session) is the real, transactional, idempotent writer for canonical workflow
action events -- it takes a `WorkflowActionEventV1` directly (via `CanonicalActionRequestV1`) and
writes `agent_runs` + `agent_run_actions` + `workflow_events` + `outbox_events` atomically, with
duplicate-idempotency-key detection. No new table, no new writer was created.

`idempotencyKey` is `phase79:${suggestionId}:${proposalChecksum}` -- ties the idempotent unit to the
*specific proposed plan*, not just the suggestion, so two different repair plans against the same
suggestion (e.g. a retried session with a different Ornith output) are distinct idempotent writes,
while re-running the exact same proposal is a no-op duplicate.

## Testability

`phase79-agentic-repair.mts` executes its full agent loop (`runAgent().catch(...)`) as a top-level
side effect on import, and throws at module load if `DATABASE_URL` is unset -- it cannot be
`import`ed in a unit test. The canonical-event construction logic was therefore extracted into a
separate, side-effect-free module (`phase79-canonical-workflow-action-event.mts`) exporting one pure
function, `buildPhase79CanonicalWorkflowActionEvent()`, which is fully unit-testable without a DB
connection or the rest of the script's environment. The actual DB write
(`writeCanonicalWorkflowActionAtomically`) stays in the script itself, since it needs a live DB
connection this test suite deliberately does not create.

## Open questions carried forward

1. Whether Phase 78, Kanban, or A2A should adopt the same `PHASE79_SYSTEM_TENANT_ID` nil-UUID
   convention, or whether a real shared system-tenant identity should be minted once multiple
   callers exist.
2. Whether `REPAIR-MUTATION-OWNER-BINDING-01` (out of scope here) should eventually supply a real
   governed-mutation receipt that Phase 79 could use as `receiptId` for successful repairs whose
   `analysis_pass_results` write did not persist, closing the disclosed gap above.
3. No consumer of these events exists yet (no Kanban projection, no A2A listener reads
   `workflow_events` for `phase79-repair:*` workflow IDs) -- this change proves emission only.
