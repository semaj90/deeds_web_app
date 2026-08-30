# Tasks: parent-atlas-agentic-run-receipt-binding

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
(`tokensUsed?: number`, `filesEdited?: string[]`, `openspecChange?: string`). `artifactRefs` remains
runtime/build/data artifact provenance; source/worktree edits are a distinct provenance class and
therefore use `filesEdited`. The recorder script reads/writes `WorkflowActionEventV1` events, not
a separate receipt type.

## T1 — Extend `WorkflowActionEventV1`, don't invent a parallel schema

- [x] Added optional `tokensUsed`, `filesEdited`, and `openspecChange` fields to the canonical
      `sveltekit-frontend/src/lib/server/atlas/workflow/workflow-action-event-v1.ts`, including
      non-negative integer and non-empty trimmed-string validation. Comments explicitly prohibit
      hidden reasoning/KV-cache payloads; only bounded aggregate telemetry is allowed.
- [x] Added focused tests covering enriched canonical events and `WorkflowActionEventDraftV1`.
- [x] Audited `artifactRefs`: keep it for runtime/build/data artifacts; retain `filesEdited` as
      source/worktree-edit provenance rather than overloading artifact identity.
- [x] Aligned the existing strict downstream schemas in
      `sveltekit-frontend/src/lib/server/atlas/workflow/context-tool-dag-contracts.ts` and
      `packages/parent-atlas/src/core/workflow-action-event.ts` so the three optional telemetry
      fields are preserved instead of being rejected by `.strict()` parsing.
- [x] Added/updated tests for the Svelte DAG adapter and `@deeds/parent-atlas` core event schema.
- [ ] **PROOF PENDING LOCAL EXECUTION:** run the focused Svelte/Vitest and Parent Atlas package
      tests listed under the validation gate below before calling T1 proven.

## T2 — Recorder script

- [x] Added `scripts/atlas/record-agentic-run-receipt.mjs`. It accepts a successful completed
      ACP/A2A `WorkflowActionEventV1`, verifies the OpenSpec slug, appends/creates a `## Run Receipts`
      section in `openspec/changes/<openspecChange>/tasks.md`, and appends the raw event JSON to
      `receipts.jsonl`.
- [x] Recorder identity is exactly `(workflowId, actionId, sequence)`; repeated application is a
      no-op. Writes use temp+rename and the target path is constrained under `openspec/changes`.
- [x] Added `--dry-run`, returning task/ledger previews without mutating the OpenSpec tree.
- [x] Added `scripts/atlas/record-agentic-run-receipt.test.mjs` covering admission, traversal
      rejection, dry-run behavior, apply behavior, and idempotence using a temporary OpenSpec tree.
- [ ] **PROOF PENDING LOCAL EXECUTION:** run the Node test, then a bounded dry-run against this
      real OpenSpec change before calling the recorder proven.

## T3 — Wire into this session's own workflow (dogfood)

- [ ] After T1/T2 validation, record a real successful ACP/A2A workflow event bound to this
      OpenSpec change and confirm it advances `multi_agent_receipt` only according to the direct
      receipt-projection rule. Do not synthesize a historical event merely to raise EXP.
- [ ] The older MCP/BitFrost/ACE optimization fork may be backfilled only if its actual runtime
      identity/timing/token evidence can be recovered. Do not manufacture missing workflow/action
      IDs from prose notes.

## T4 — Follow-up (not blocking T1-T3)

- [ ] `record-workflow-run-receipt.mjs` variant for `Workflow` tool runs, walking
      `journal.jsonl` per proposal.md §4 — one receipt per workflow run, not per inner `agent()`
      call.
- [ ] Decide whether ACP/A2A MCP tool-call chains get receipts too, or whether that's
      permanently out of scope because `acp-mcp-telemetry.ts` already covers that surface at a
      finer grain than OpenSpec-change-level receipts are meant for.

## T5 — Tournament EXP / proof-progress projection

- [x] Add a fixed weighted gate denominator in
      `sveltekit-frontend/src/lib/server/atlas/tournament/parent-atlas-tournament-progress-v1.ts`.
      Progress is proof-weighted; token/cache/time savings are telemetry and cannot raise the
      proof percentage.
- [x] Add fail-closed receipt adapters in
      `parent-atlas-tournament-receipt-aggregator-v1.ts` for the current structural, lineage,
      semantic_768, PostgreSQL↔Qdrant parity, Qdrant canary, Go Retrieval stream, and bounded
      low-rank/Tang-inspired shortlist receipts. Missing or unsupported receipts leave a gate
      `UNPROVEN`.
- [x] Preserve canary scope in the score. The current exact 15-row cohort contributes only
      `15/128` completion to scalable identity/representation/projection gates; it cannot appear
      as a full-corpus pass.
- [x] Mount `TournamentExpBar.svelte` through the route-local Parent Atlas admin layout so it is
      visible above every dashboard tab without rewriting the legacy 32KB page.
- [x] Add `sveltekit-frontend/scripts/atlas/emit-parent-atlas-tournament-progress-v1.mts` to emit
      `docs/reports/parent-atlas-tournament-progress-v1.json` from the same receipt aggregator
      used by the UI.
- [x] Added `parent-atlas-agentic-receipt-projection-v1.ts`, which scans
      `openspec/changes/*/receipts.jsonl`, re-validates each event with the canonical
      `validateWorkflowActionEvent()`, checks the event↔OpenSpec directory binding, deduplicates
      workflow/action/sequence identity, and feeds the accepted evidence into the existing
      `multi_agent_receipt` gate. One distinct successful action is `PARTIAL` (0.5); two or more
      distinct workflow/action identities are required for `PROVEN`.
- [x] The admin HUD and report emitter now expose raw measured `acceptedAgentTurns`,
      `uniqueAgentActions`, `tokensUsed`, `wallTimeMs`, edited files, OpenSpec changes, and receipt
      paths. These counters do not create an inferred savings percentage.
- [x] Preserve any efficiency percentages only when a separate explicit baseline receipt supplied
      them; direct agent receipts never infer token/wall-time savings from raw usage.
- [ ] **PROOF PENDING LOCAL EXECUTION:** run the agentic projection Vitest plus the full focused
      tournament suite before marking direct receipt consumption proven.
- [ ] Add explicit ACE/BitFrost/Valkey MISS→COMPUTE→HIT/invalidation receipts before those
      memory gates can advance beyond `UNPROVEN`/`WIRED`.
- [ ] Add PostgreSQL eligibility/index-plan receipt using result parity plus
      `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` evidence; bitmap/AIO plan choice is planner telemetry,
      not application authority.
- [ ] Add TurboVec only after the indexed Postgres/Qdrant/Go Retrieval baseline is bound to the
      same CandidateOrdinal snapshot and held-out Recall/NDCG/latency/memory receipt.

## Validation gate — NOT YET EXECUTED IN THIS BRANCH SESSION

```bash
cd sveltekit-frontend
npx vitest run \
  src/lib/server/atlas/workflow/workflow-action-event-v1.spec.ts \
  src/lib/server/atlas/workflow/context-tool-dag-contracts.spec.ts \
  src/lib/server/atlas/tournament/parent-atlas-tournament-progress-v1.spec.ts \
  src/lib/server/atlas/tournament/parent-atlas-tournament-receipt-aggregator-v1.spec.ts \
  src/lib/server/atlas/tournament/parent-atlas-agentic-receipt-projection-v1.spec.ts
node --test ../scripts/atlas/record-agentic-run-receipt.test.mjs
npm run check

cd ../packages/parent-atlas
npm run test:workflow-action-event
```

Then emit the bounded report:

```bash
cd ../../sveltekit-frontend
npx tsx scripts/atlas/emit-parent-atlas-tournament-progress-v1.mts
```

## Open questions (record, don't resolve here)

- Who calls the recorder — is it always the human operator reviewing the task-notification, or
  should the coordinating agent call it automatically whenever it already knows the OpenSpec
  binding? Current direction: automatic only when canonical workflow/action identity and the
  OpenSpec change are both known; otherwise leave the run unbound rather than guessing.
