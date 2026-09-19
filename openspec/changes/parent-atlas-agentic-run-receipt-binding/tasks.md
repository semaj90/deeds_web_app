# Tasks: parent-atlas-agentic-run-receipt-binding

## Checkpoint/coordinate reconciliation — 2026-09-05

WorkflowActionEventV1 remains canonical workflow/action/receipt identity.
No AgentRunSnapshotV1 or parallel AgenticRunReceiptV1 will be created.
WorkflowExecutionCoordinatesV1 already separates framework, orchestrationRuntime,
checkpointProvider, actionExecutor and transport; reuse its actual enums.
Do not add duplicate fields solely to rename Mastra/LangGraph checkpoints.

- [x] RUN-CHECKPOINT-BINDING-01 added the smallest additive checkpoint binding on the existing
  `WorkflowActionEventV1.metadata` surface; no parallel run schema was created. Evidence:
  `packages/parent-atlas/src/core/workflow-checkpoint-binding-v1.ts` and
  `packages/parent-atlas/test/workflow-checkpoint-binding-v1.test.mjs` prove stable workflow/action
  identity across retry, coordinate mismatch rejection, binding checksum rejection, and preservation
  of existing mutation-authorization metadata. Contract status: `PROVEN`; live backend checkpoint
  readback remains a separate gate. Census: `docs/reports/agentic-checkpoint-binding-audit-v1.json`.
- [x] RUN-EXPERIENCE-OWNER-01 reconcile the existing T5 curated digest question against
  ContextManifest and receipt summary/artifact refs before defining any observation type.
  Evidence: `scripts/atlas/audit-agentic-run-experience-owner-v1.mjs` and
  `docs/reports/agentic-run-experience-owner-audit-v1.json` confirm that
  `WorkflowActionEventV1` owns raw run identity/evidence refs, `CompiledContext`/
  `ContextManifest` owns assembled evidence and prompt packets, and no current owner
  exists for a curated post-run digest. No parallel observation type was created;
  `canonicalAuthority=false`, `writesPerformed=false`.

Mastra-oriented adapters are present but include a tool shim; this is not a live
durability proof. The nested E2E ledger is REFERENCE_ONLY. Root governed-compute owns
backend execution integration; this owner binds its receipts. T1-T4 remain open
where their own acceptance evidence is missing.

## T0 — Audit before building (repo hard rule) — DONE this session

- [x] Grepped `packages/atlas-core/src/telemetry/acp-mcp-telemetry.ts` (`TelemetryCollector`,
      `AsyncOpRecord`/`ToolCallRecord`/`NodeExecutionRecord`/`TelemetryCheckpoint`, indexed by
      `trace_id`). **Different granularity** (per-LangGraph-node execution, not per-agentic-run)
      and **zero production callers** — only referenced in `tests/acp-end-to-end-integration.spec.ts`
      and docs (`docs/SESSION-83-ACP-MCP-TELEMETRY.md`, `packages/atlas-core/docs/ACP-MCP-TELEMETRY-INTEGRATION.md`).
      Not a fit; not live. Do not extend this one.
- [x] Read `openspec/changes/atlas-feature-intelligence/agentic-workflow-next-steps.md`. It
      defines the **real canonical owner** for this: `WorkflowActionEventV1`
      (`sveltekit-frontend/src/lib/server/atlas/workflow/workflow-action-event-v1.ts`) —
      "the internal ordered runtime event and identity owner for workflow/action/receipt/resource
      IDs." Has a real validator (`validateWorkflowActionEvent()`), a `WorkflowLane` enum that
      already includes `'acp'`/`'a2a'`, `evidenceRefs`/`artifactRefs` string arrays,
      `startedAt`/`finishedAt`, `state` (`queued|running|waiting|blocked|succeeded|failed`).
      Also used by `context-tool-dag-contracts.ts` and `packages/parent-atlas/src/core/workflow-action-event.ts`
      — a real, wired contract, not dead code.

**T0 verdict — corrects the original design**: do **not** define `AgenticRunReceiptV1` as a new
parallel schema (would violate this repo's "one canonical owner per capability" rule). Instead:
extend `WorkflowActionEventV1` with the 3 fields it's missing for this use case
(`tokensUsed?: number`, `filesEdited?: string[]`, `openspecChange?: string`) and treat
`evidenceRefs`/`artifactRefs` as already covering part of "what did this run touch" — reuse them
for file paths rather than adding a redundant field if they fit. The recorder script (T2) then
reads/writes `WorkflowActionEventV1` events, not a separate receipt type.

## T1 — Extend `WorkflowActionEventV1`, don't invent a parallel schema (revised per T0)

- [x] Added 3 optional fields to `WorkflowActionEventV1` (`tokensUsed`, `filesEdited`,
      `openspecChange`) with validation and canonical adapter round-trip coverage.
      (`sveltekit-frontend/src/lib/server/atlas/workflow/workflow-action-event-v1.ts`):
      `tokensUsed?: number`, `filesEdited?: string[]`, `openspecChange?: string`. Extend
      `validateWorkflowActionEvent()` with matching checks (non-negative integer for
      `tokensUsed`; non-empty trimmed strings for `openspecChange`/each `filesEdited` entry, same
      style as the existing `isFiniteNonNegative` helper).
- [x] Confirmed `WorkflowActionEventDraftV1` (the `Omit<..., 'schema'|'workflowRevision'|'sequence'|'emittedAt'>`
      type) still round-trips correctly with the 3 new optional fields — no test should need to
      change since they're optional additions, but re-run whatever existing test currently
      exercises `validateWorkflowActionEvent()` to confirm no regression.
- [x] Confirmed `artifactRefs` remains the canonical artifact-ID list in
      `context-tool-dag-contracts.ts` and `packages/parent-atlas/src/core/workflow-action-event.ts`;
      it is not a source-edit list. Retained `filesEdited` as distinct optional receipt metadata.

## T2 — Recorder script

- [x] Added `scripts/atlas/record-agentic-run-receipt.mjs`, a CLI that takes a `WorkflowActionEventV1`
      (with the new fields populated) whose `kind === 'completed'` and `openspecChange` set, and:
      appends/creates a `## Run Receipts` section in `openspec/changes/<openspecChange>/tasks.md`
      (human-readable bullet), and appends the raw event JSON to
      `openspec/changes/<openspecChange>/receipts.jsonl` (machine-readable ledger — one
      `WorkflowActionEventV1` per line, not a separate receipt shape). Idempotent on
      `(workflowId, actionId, sequence)` — the event's own identity triple, not a new key.
- [x] Dry-run mode (`--dry-run`) prints the planned diff without writing — this repo's convention
      for any script that mutates files under `openspec/`.
- [x] Smoke-tested against an isolated non-production OpenSpec change directory — confirmed the
      `## Run Receipts` section renders correctly and a second identical call is a true no-op.
      Evidence: `scripts/atlas/record-agentic-run-receipt.smoke.mjs`.

## T3 — Wire into this session's own workflow (dogfood)

- [x] Once T1/T2 land, retroactively record a receipt for the MCP/BitFrost/ACE optimization fork
      from this session (`agentLabel: "Find optimizations in MCP/BitFrost/ACE synthesis path"`,
      `tokensUsed: 752970`, `durationMs: 77383`, `toolUses: 6`, `openspecChange` = whichever
      change the two applied fixes (context-assembler.ts cache-key revision binding,
      ace-top-retrieval-cache.ts TTL fix) should be tracked under — create a
      `parent-atlas-ace-bitfrost-cache-correctness` change for those two fixes if none fits,
      since they were applied ad-hoc this session without an OpenSpec change to attach to.
      Recorded in `parent-atlas-ace-bitfrost-cache-correctness/receipts.jsonl` with the existing
      idempotent recorder; no runtime datastore write was performed.

## T4 — Follow-up (not blocking T1-T3)

- [x] `record-workflow-run-receipt.mjs` variant for `Workflow` tool runs, walking
      `journal.jsonl` per proposal.md §4 — one receipt per workflow run, not per inner `agent()`
      call. Implemented as a dry-run-by-default, fail-closed adapter that groups by
      `workflowId`/`workflow_id`, preserves inner tool/agent events as evidence, omits missing
      usage fields, and delegates explicitly authorized apply mode to the existing idempotent
      recorder. Evidence: `scripts/atlas/record-workflow-run-receipt.mjs`.
- [x] Decide whether ACP/A2A MCP tool-call chains get receipts too, or whether that's
      permanently out of scope because `acp-mcp-telemetry.ts` already covers that surface at a
      finer grain than OpenSpec-change-level receipts are meant for. Decision: keep the existing
      ACP/MCP telemetry as the fine-grained owner; do not add a second OpenSpec-change receipt
      path until a standard completion envelope exists. This change remains responsible for
      binding coordinator-supplied workflow receipts only.

## T5 — Cross-reference (2026-09-05): `AgentObservationV1`/`AgentRunSnapshotV1` proposal checked
against this change's own T0 finding, not built as new schemas

An inline chat proposal (delivered while `parent-atlas-retrieval-lineage-dag-convergence` was
mid-flight) proposed two new contracts: `AgentRunSnapshotV1` (`runId`, `parentRunId`, `agentId`,
`state ∈ {PLANNED, RUNNING, WAITING_APPROVAL, SUSPENDED, COMPLETED, FAILED}`,
`completedSteps[]`/`pendingSteps[]`, `evidenceRefs[]`/`outputRefs[]`, `checkpointAt`,
`snapshotChecksum`) and `AgentObservationV1` (`runId`/`taskId`, `observedFacts[]`/`decisions[]`/
`unresolved[]`/`outcomes[]`, `evidenceRefs[]`, `observationChecksum`) — both intended as the
run-state/experience layer under an optional Mastra durable-workflow outer layer.

- [x] Checked `AgentRunSnapshotV1` against this change's own T0 finding before treating it as
  new: it isn't. `WorkflowActionEventV1` (`sveltekit-frontend/src/lib/server/atlas/workflow/
  workflow-action-event-v1.ts`) already has near-1:1 field coverage — `workflowId` +
  `parentActionId` (run/parent-run identity), `attempt` (retry count), `state ∈ {queued, running,
  waiting, blocked, succeeded, failed}` (maps directly onto the proposed
  PLANNED/RUNNING/WAITING_APPROVAL/SUSPENDED/COMPLETED/FAILED enum), `lane` already including
  `'acp'`/`'a2a'` as first-class values, and `WorkflowProgressV1` (`completedUnits`/`totalUnits`/
  `fraction`/`etaMs`) covering the completed/pending-steps concept. **Do not add a parallel
  `AgentRunSnapshotV1` type** — if Mastra (or any other durable-workflow engine) is ever adopted
  as the optional outer layer this proposal describes, its snapshots should map onto
  `WorkflowActionEventV1`'s existing shape, not introduce a second run-state contract. This is the
  same "one canonical owner per capability" correction T0 already made once in this file for
  `AgenticRunReceiptV1` vs `WorkflowActionEventV1` — applying it a second time here rather than
  letting a second differently-shaped duplicate through.
- [x] `AgentObservationV1`'s curated-experience concept (`observedFacts[]`/`decisions[]`/
  `unresolved[]`/`outcomes[]` — a synthesized summary, not a raw event) is not fully covered by
  `WorkflowActionEventV1`, and `ContextManifest`/`CompiledContext` own assembled evidence rather
  than a post-hoc digest. The reconciliation is complete: no current owner exists for the
  curated digest, so no parallel observation type is introduced in this change. Evidence:
  `docs/reports/agentic-run-experience-owner-audit-v1.json`; future digest placement belongs to
  the memory-layer owner after a separate design decision.
- [x] Recommendation recorded: this change (`parent-atlas-agentic-run-receipt-binding`) remains
  the correct owner for the run-receipt/state-binding half of the proposal;
  `parent-atlas-memory-architecture-freeze` remains the correct owner for the broader memory-layer
  framing (L0-L7, per its own fifth addendum) that this run-state material slots into as L6/L7.
  Neither file needed a new OpenSpec change created for this.

## Open questions (record, don't resolve here)

- Who calls the recorder — is it always the human operator reviewing the task-notification, or
  should the coordinating Claude session call it automatically the moment a bound `Agent`/`fork`
  task-notification with a known `openspecChange` arrives? Leaning toward: automatic when the
  coordinator already knows the binding (as in this session's ACE/BitFrost fork, if a change slug
  had existed for it at spawn time), manual/prompted otherwise.
