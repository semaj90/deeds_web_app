## 1. AR-01 — OAK client capability census + typed client

- [x] 1.1 Confirmed live capability of `:8095/oak/*` (health/lookup/search/traverse) — already
      done in `parent-atlas-ontology-oaklib-fanout-bitmap`'s tasks.md section 7; reused, not
      re-audited.
- [x] 1.2 Defined `OakResolutionEvidenceV1` contract (pure Zod, no I/O):
      `sveltekit-frontend/src/lib/server/atlas/agentic/contracts/oak-resolution-evidence-v1.ts`.
- [x] 1.3 Implemented the typed client:
      `sveltekit-frontend/src/lib/server/atlas/agentic/oak-resolution-evidence-client.ts` —
      bounded calls (`lookup`, `search`, `ancestors` via `/oak/traverse`), fail-closed to
      `RESOLUTION_UNAVAILABLE`, never synthesizes `concept:<raw-label>`.
- [x] 1.4 Unit-tested (mocked `fetch`) — reachable/resolved, unreachable/`RESOLUTION_UNAVAILABLE`,
      never-fabricates-on-error, `canonicalAuthority: false` always present.

## 2. AR-02 — Action/Workflow registry owner census (NOT DONE)

- [ ] 2.1 Decide whether the action registry becomes a Postgres-backed, BM25-searchable table
      (per the operator's section 7) or stays code-defined. Not decided this pass — AR-03's
      seed registry is deliberately code-only until this census happens.

## 3. AR-03 — AgenticActionV1 contract + seed registry

- [x] 3.1 Confirmed via grep no existing contract declares an action/tool vocabulary with
      `mutability`/`requiresHumanApproval` fields — genuinely new, not a duplicate.
- [x] 3.2 Defined `AgenticActionV1` contract:
      `sveltekit-frontend/src/lib/server/atlas/agentic/contracts/agentic-action-v1.ts`.
- [x] 3.3 Seeded a registry with the operator's example moves
      (`sveltekit-frontend/src/lib/server/atlas/agentic/agentic-action-registry-v1.ts`):
      `AST_EXPAND`, `RG_EXACT_SEARCH`, `BM25_SEARCH`, `SEMANTIC_SEARCH`, `OAK_RESOLVE`,
      `HYPERGRAPH_EXPAND`, `APPLY_SOURCE_PATCH`, `RUN_TYPECHECK`, `RUN_TESTS`,
      `AWAIT_OPERATOR`, `RETRY_WITH_MORE_CONTEXT`, `STOP_SUCCESS`, `STOP_BLOCKED`.
- [x] 3.4 Implemented lookup-by-id + filter-by-kind/mutability functions; unit-tested (13 seed
      actions present, mutation actions classified non-`READ_ONLY`, filter behavior verified).

## 4. AR-04 — HyperEdge action/member roles (NOT DONE)

- [ ] 4.1 `AgenticHyperEdgeV1` needs a nullable `canonicalId` + `resolutionState` per member,
      which the existing canonical `HyperedgeV1` (`.strict()`, `canonicalId: z.string().min(1)`
      required) does not support. Decide: new distinct contract vs. a breaking change to
      `HyperedgeV1` — not decided, not built.

## 5. AR-05 — bitencoded capability mask + CPU parity (NOT DONE)
## 6. AR-06 — Go Retrieval → canonical candidate adapter (NOT DONE)
## 7. AR-07 — OAK evidence enrichment adapter (NOT DONE — AR-01's client exists but isn't wired
      into any retrieval/candidate path yet)
## 8. AR-08 — HyperGraphRAG n-ary action expansion (NOT DONE)
## 9. AR-09 — CandidateFeatureMatrix action features (NOT DONE)
## 10. AR-10 — Tang low-rank recommendation challenger scaffold (NOT DONE)
## 11. AR-11 — DSPy program/eval snapshot contract (NOT DONE)
## 12. AR-12 — GEPA offline optimization harness scaffold (NOT DONE)
## 13. AR-13 — Agentic DAG synthesis (NOT DONE)
## 14. AR-14 — ParameterResolver wiring (NOT DONE)
## 15. AR-15 — bounded repair-loop fixture (TS2345 deterministic fixture) (NOT DONE)
## 16. AR-16 — ExecutionReceipt → HyperEdge projection (NOT DONE)
## 17. AR-17 — ContextManifest/PromptPlan integration (NOT DONE)

Items 5-17 above are recorded as explicit gates from the operator's own specification, not
attempted this pass. Each requires its own bounded design/implementation session — building them
without their prerequisite gates (especially AR-02's registry-owner decision and AR-04's
hyperedge-member-shape decision) would mean guessing architecture decisions the operator asked to
be made deliberately, not implied.

## 18. CRITICAL finding while running AR-01/AR-03's tests: a large, pre-existing
      `agentic-file-compiler/` directory was found, likely overlapping several later gates

- [x] 18.1 Running `vitest run src/lib/server/atlas/agentic` (to test AR-01/AR-03) picked up
      **23 test files, 65 passing tests**, almost all from
      `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/` — a directory with **30+
      source files** not mentioned or found in any earlier audit this session:
      `query-classifier.ts`, `prompt-plan.ts`, `retrieval-plan.ts`, `mastra-workflow-compiler.ts`,
      `workflow-spec-builder.ts`, `mutation-approval-resolver.ts`, `exact-promotion.ts`,
      `governed-replay-admission-v1.ts`, `contracts.ts` (with a real `WorkflowActionEventV1`,
      `AtlasWorkflowSpecV1`), plus a canonical bridge to
      `@deeds/parent-atlas/core/workflow-action-event`.
- [x] 18.2 Checked the one directly-relevant overlap risk before finishing this pass:
      `contracts.ts`'s `WorkflowActionEventV1` has `actionId: z.string().min(1)` (an open string,
      no fixed catalog) and a `kind` enum that is a **lifecycle-status** vocabulary (scheduled/
      started/progress/blocked/retrying/completed/failed/...), not a **move-catalog** vocabulary
      like `AgenticActionV1`'s (AST_EXPAND/RG_EXACT_SEARCH/etc. with mutability/schema/approval).
      **Confirmed complementary, not duplicative** — `WorkflowActionEventV1` records that some
      action occurred and in what lifecycle state; `AgenticActionV1` (this pass) defines what
      actions legally exist and their mutability. No fix needed for AR-01/AR-03 specifically.
- [x] 18.3 **Not audited further this pass, flagged as a hard blocker for later gates.** `query-
      classifier.ts` (names `QueryClassificationV1` from the operator's target architecture
      step 1), `prompt-plan.ts` (step 10's `PromptPlanV1`), `retrieval-plan.ts` (step 6's Go
      Retrieval integration), and `mastra-workflow-compiler.ts` (step 11's DAG synthesis /
      step 13's DAG runtime) all sound like they may already substantially implement AR-06,
      AR-11, AR-13, and/or AR-17. **Do not start any of those gates without first reading this
      directory in full** — building parallel implementations there would repeat exactly the
      OAK-kernel duplication mistake found earlier this session, at much larger scale (30+ files,
      not 1).
