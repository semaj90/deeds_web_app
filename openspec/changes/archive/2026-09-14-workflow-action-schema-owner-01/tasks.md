## 1. Canonical schema extension

- [x] 1.1 Extended `packages/parent-atlas/src/core/workflow-action-event.ts`'s `workflowActionEventSchema`
      with all additive fields from design.md Decision 1 (`kind` union widened, `runId`, `executor`,
      `revisions`, `inputRefs`, `outputRefs`, `errorRef`, `state`, `operation`, `progress`, `target`,
      `visual`, `canonicalIds`, `toolName`, `mutationRequested`, `validationRequired`, `checksum`).
      All new fields optional/defaulted.
- [x] 1.2 Documented the embedded-`checksum`-vs-receipt-checksum relationship inline as an open
      question (design.md Open Question 3) rather than force an under-specified runtime check --
      no real producer exists yet to determine the correct hash-input contract.
- [x] 1.3 `packages/parent-atlas/test/workflow-action-event.test.mjs` re-run unmodified: 3/3 pass,
      both `completed`->`receiptId` and `failed`->`errorCode` invariants still enforced.
- [x] 1.4 Re-ran `packages/parent-atlas`'s test suite for all 5 real consumers: 21/21 pass.
      **Found and fixed a real regression** design.md did not anticipate: `temporal-action-workflow-adapter.ts`'s
      `ledgerState()` switch over `kind` became non-exhaustive once the enum widened (TS2366).
      Fixed by mapping the 4 new kinds (`suspended`/`resumed`/`validated`/`materialized`) to the
      existing `PROGRESS` ledger state. `tsc -p tsconfig.json` now clean except one confirmed
      pre-existing, unrelated failure in `knowledge-page-dag-binding-v1.spec.ts` (different domain,
      untouched by this change).

## 2. Cross-workspace export

- [x] 2.1 Added `"./core/workflow-action-event": "./dist/core/workflow-action-event.js"` to
      `packages/parent-atlas/package.json`'s `exports` map.
- [x] 2.2 Rebuilt `packages/parent-atlas` -- `dist/core/workflow-action-event.js` and `.d.ts` confirmed
      present.
- [x] 2.3 Verified live from `sveltekit-frontend/`: `import('@deeds/parent-atlas/core/workflow-action-event')`
      resolves and `workflowActionEventSchema.parse()` accepts the new `'suspended'` kind value.
      Proven, not assumed.

## 3. sveltekit-frontend adapters

- [x] 3.1 Added `toCanonicalWorkflowActionEvent()`/`fromCanonicalWorkflowActionEvent()` to
      `workflow-action-event-v1.ts`. Local type kept as-is (see design.md's implementation note --
      the local `schema` literal was NOT removed, since it was never a runtime collision and
      removing it would force unnecessary test churn for no functional benefit). Guards added for
      canonical-only `kind`/`transport` values (`'suspended'` etc., `'mcp'`) this local shape cannot
      represent -- throws explicitly rather than silently coercing.
- [x] 3.2 Added round-trip test to `workflow-action-event-v1.spec.ts`: 9/9 pass (6 pre-existing + 3
      new: full round-trip, kind-guard throw, transport-guard throw).
- [x] 3.3 Added `toCanonicalWorkflowActionEvent()`/`fromCanonicalWorkflowActionEvent()` to
      `agentic-file-compiler/contracts.ts`, mapping `runId`/`executor`/`revisions`/`inputRefs`/
      `outputRefs`/`errorRef`/`checksum`.
- [x] 3.4 Added new spec `contracts-workflow-action-canonical-adapter.spec.ts`: 2/2 pass (full
      round-trip + kind-guard throw).
- [x] 3.5 Re-verified `workflow-action-event-adapter.ts` via a live smoke import (dynamic `import()`
      + real function call) -- confirmed unaffected, produces the correct `writeActionAtomically`
      request shape.
- [x] 3.6 Added `toCanonicalWorkflowActionEvent()`/`fromCanonicalWorkflowActionEvent()` to
      `context-tool-dag-contracts.ts`, mapping `canonicalIds`/`toolName`/`mutationRequested`/
      `validationRequired`.
- [x] 3.7 Added round-trip test to `context-tool-dag-contracts.spec.ts`: 5/5 pass (3 pre-existing + 2
      new). Re-ran `atlas-kernel-session.spec.ts` (real production consumer of the same file): 5/5
      pass, unchanged. `route-head-dag-builder-v1.ts` has no spec file of its own (confirmed via
      file search) -- not created here, out of scope for this schema-convergence change.

## 4. Verification and receipt

- [x] 4.1 Full test suite for all touched files run together: **45/45 passing total** (3 + 21 in
      packages/parent-atlas; 9 + 5 + 2 + 5 = 21 in sveltekit-frontend). Zero regressions beyond the
      one real bug found-and-fixed in task 1.4.
- [x] 4.2 Confirmed via direct `grep` for `'atlas.workflow-action.v1'` across `sveltekit-frontend/src`:
      no NEW file introduced by this change declares a competing schema. The pre-existing 4 files
      (now canonical owner + 3 adapters) are the only ones referencing the literal, each now
      correctly classified per the disposition table.
- [x] 4.3 Wrote `docs/reports/workflow-action-schema-owner-01-results.json`: consumer census,
      per-file disposition table, test results, the real bug found/fixed, and open questions carried
      forward. `RESULT: DRY_RUN_PROVEN`.
- [x] 4.4 This file updated with actual results next to each task, not just checkbox ticks.

## 5. Follow-up (explicitly NOT this change's scope -- recorded, not implemented)

- [x] 5.1 Recorded as an explicit follow-up (not implemented): wire a real Phase 79 emitter to
      construct and persist canonical `WorkflowActionEventV1` events -- Phase 79 currently emits
      none of the four shapes despite its own header comment claiming it does. See
      `docs/reports/workflow-action-schema-owner-01-results.json`'s `openQuestionsCarriedForward`.
- [x] 5.2 Recorded as an explicit follow-up (not implemented): revisit whether
      `workflow-action-event-adapter.ts`'s `writeActionAtomically` boundary should eventually accept
      a canonical `WorkflowActionEventV1` directly, once a real caller exists to inform the decision.
