# Tasks: Phase 79 canonical WorkflowActionEventV1 wiring

## 1. Pure construction module

- [x] 1.1 Created `sveltekit-frontend/scripts/phase79-canonical-workflow-action-event.mts` exporting
      `buildPhase79CanonicalWorkflowActionEvent()` -- pure, no top-level side effects, no DB
      connection required to import.
- [x] 1.2 Mapped Phase 79's real outcome data (`status`, `failureReason`, `ledgerResult`,
      `proposalChecksum`, `context.packets`) onto the canonical schema's required fields, with each
      mapping decision recorded in design.md (workflowId/workflowRevision/sequence/actionId/runId/
      dagNodeId/attempt/lane/kind/producerRevision).
- [x] 1.3 Handled the schema's `superRefine` constraints honestly: `completed` only constructed when
      a real `receiptId` (the `analysis_pass_results` row id) is available; `failed` always
      constructed with `errorCode` derived from the real failure message's leading token.
- [x] 1.4 Used fresh `randomUUID()` for `runId`/`actionId` (required by
      `prepareCanonicalActionWriteV1()`'s UUID enforcement) and the documented nil-UUID sentinel
      for `tenantId` (no real multi-tenant concept exists in this repo for Phase 79).

## 2. Wiring into phase79-agentic-repair.mts

- [x] 2.1 Added `emitCanonicalWorkflowActionEvent()` to `phase79-agentic-repair.mts`, calling the
      pure builder then persisting via the **existing** `writeCanonicalWorkflowActionAtomically()`
      (`sveltekit-frontend/src/lib/server/agent/action-writer.ts`) -- no new persistence path
      created.
- [x] 2.2 Called `emitCanonicalWorkflowActionEvent()` from `processOneSuggestion()` immediately after
      `ledgerResult` is computed (same point `persistRepairEpisode()` already runs), for both
      `applied === true` and `applied === false` terminal outcomes.
- [x] 2.3 Included `canonicalEventResult` in the existing final JSON attempt receipt
      (`writeAttemptReceipt()`) so the emission outcome (emitted/skipped + reason) is visible in the
      same place all other Phase 79 evidence already lands.
- [x] 2.4 Updated the script's header docstring and `sessionReceipt.persistencePolicy` string to
      describe the new canonical-event emission honestly (including the disclosed
      completed-without-receipt gap), not just the pre-existing `analysis_pass_results` write.
- [x] 2.5 Confirmed no change to `--apply`/`--dry-run` gating, risk-level gating, or the actual
      file-mutation/rollback logic -- this is additive only, called after the mutation outcome is
      already determined.

## 3. Verification

- [x] 3.1 Wrote `scripts/phase79-canonical-workflow-action-event.test.mts` (5 tests): succeeded+
      persisted-ledger -> valid `completed` event round-tripping through the real
      `workflowActionEventSchema`; succeeded+unpersisted-ledger -> honest skip, not a fabricated
      receipt; failed with a real structured failure message -> `errorCode` correctly derived;
      failed with `null` failureReason -> `UNKNOWN_FAILURE` fallback, no throw; two different
      proposals against the same suggestion -> distinct idempotency keys.
- [x] 3.2 Ran `npx tsx --test scripts/phase79-canonical-workflow-action-event.test.mts` fresh:
      **5/5 pass**.
- [x] 3.3 Ran `npx tsgo --noEmit` (repo-wide) and confirmed zero errors attributable to either
      touched file (`phase79-agentic-repair.mts`, `phase79-canonical-workflow-action-event.mts`) --
      the 74 pre-existing errors in the baseline are all in unrelated files (`nodejs-whisper`
      missing types, `QdrantClient.search` typing, etc.), unchanged by this work.
- [x] 3.4 Wrote `docs/reports/phase79-canonical-workflow-action-wiring-results.json` with the
      per-file disposition, test results, and the disclosed open questions, `RESULT:
      DRY_RUN_PROVEN` (construction and schema-validation proven; the actual live DB write via
      `writeCanonicalWorkflowActionAtomically()` was NOT executed against a real database in this
      change -- Phase 79 is normally invoked standalone with real Postgres/Ornith dependencies,
      out of scope to stand up here -- so `APPLY_PROVEN` is not claimed).
- [x] 3.5 This file updated with actual results next to each task, not just checkbox ticks.

## 4. Explicitly not done (recorded, not implemented)

- [x] 4.1 No live end-to-end run of `phase79-agentic-repair.mts --apply` was performed to prove the
      canonical event actually lands in `agent_runs`/`agent_run_actions`/`workflow_events` against a
      real Postgres instance -- this requires a live DB + Ornith + real pending `error_suggestions`
      rows, which is `AGENTIC-REPAIR-CANARY-01`'s scope, explicitly out of scope for this change.
- [x] 4.2 No consumer (Kanban projection, A2A listener, LangGraph resume) was wired to read these
      events back -- recorded as future work in design.md's open questions.
