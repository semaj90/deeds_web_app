# Parent Atlas grounded execution receipts

## Purpose

Close the control-plane gap between `ContextManifestV1`, Kanban claim/run identity, worker execution, validation evidence, and durable execution provenance.

This tranche does **not** change Kanban truth ownership, Graphify ownership, SearchRuntime ownership, or canonical evidence ownership. It adds an append-only execution provenance ledger and a strict validator before a Kanban attempt can reference a receipt.

## Invariants

```text
ContextManifestV1
      |
      v
GroundedContextManifestV1
  taskId
  runId
  workerId
  exact ContextManifest checksum
  selected packet keys
  selected process IDs
  source refs
  admitted evidence refs
      |
      v
worker execution
      |
      v
GroundedExecutionReceiptV1
  active claim digest
  same task/run/worker
  same grounded-context checksum
  same ContextManifest checksum
  mutation/output refs
  executable validation observations
  evidence refs subset of admitted context evidence
      |
      v
append-only durable receipt
      |
      v
kanban_task_attempts.execution_receipt_id
```

### Hard rules

- `SUCCESS` requires at least one `PASSED` validation observation.
- `SUCCESS` is invalid if any validation observation is `FAILED` or `ERROR`.
- A stale `runId` cannot persist a receipt for the current task.
- A worker mismatch cannot persist a receipt.
- The raw `claim_token` is never stored in the receipt; only SHA-256 of the active claim token is stored.
- Execution evidence must be a subset of evidence admitted by the grounded context.
- Reusing a `receipt_id` with different receipt content is an immutability conflict.
- Linking the same receipt to the same Kanban attempt is idempotent.
- Persisting a receipt does not itself transition a task to `DONE`.
- The receipt table has `canonicalAuthority=false`; it is execution provenance, not canonical source/evidence truth.

## Files

```text
sveltekit-frontend/src/lib/server/atlas/execution/
  grounded-execution-receipt-v1.ts
  grounded-execution-receipt-v1.spec.ts
  ground-context-manifest-v1.ts
  ground-context-manifest-v1.spec.ts
  grounded-execution-repository.ts

sveltekit-frontend/drizzle/manual/
  20260821_grounded_execution_receipts.sql
```

## Proof state

```text
GER-0 ContextManifest checksum binding       IMPLEMENTED_UNPROVEN
GER-1 task/run/worker grounding              IMPLEMENTED_UNPROVEN
GER-2 active-claim digest validation         IMPLEMENTED_UNPROVEN
GER-3 SUCCESS validation gate                IMPLEMENTED_UNPROVEN
GER-4 evidence-subset grounding gate         IMPLEMENTED_UNPROVEN
GER-5 append-only receipt repository         IMPLEMENTED_UNPROVEN
GER-6 receipt -> Kanban attempt linkage      IMPLEMENTED_UNPROVEN
GER-7 migration dry-run/readback             PENDING
GER-8 live worker integration                PENDING
GER-9 DONE transition receipt enforcement    BLOCKED_PENDING_GER-8
GER-10 recommendation feedback from receipt  PENDING
```

## Workstation proof

From `sveltekit-frontend`:

```bash
npx vitest run \
  src/lib/server/atlas/execution/grounded-execution-receipt-v1.spec.ts \
  src/lib/server/atlas/execution/ground-context-manifest-v1.spec.ts \
  src/lib/server/atlas/kanban-task-board.test.ts
```

Then inspect the migration without applying it to production. Apply only to a bounded disposable/local database first:

```text
sveltekit-frontend/drizzle/manual/20260821_grounded_execution_receipts.sql
```

The first database-backed fixture must prove:

1. current `kanban_tasks.task_id/current_run_id/assignee/claim_token` matches the receipt;
2. receipt insert succeeds;
3. readback checksum equals the submitted receipt checksum;
4. `kanban_task_attempts.execution_receipt_id` points to that exact receipt;
5. replaying the same receipt is idempotent;
6. changing receipt content under the same receipt ID fails immutability validation;
7. a stale run, stale claim, worker mismatch, context checksum mismatch, or ungrounded evidence reference writes nothing.

## Integration order

```text
GER unit proof
  -> migration disposable-db proof
  -> bounded grounded worker fixture
  -> durable readback receipt
  -> validation outcome feedback
  -> only then consider enforcing receipt evidence before Kanban DONE
```

Do not wire task completion to this table until the bounded worker fixture proves the complete path.
