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
## 6. AR-06 — Go Retrieval → canonical candidate adapter (SUPERSEDED_BY_EXISTING_OWNER — see
      section 18.3: `query-classifier.ts` + `retrieval-plan.ts`, live in `/api/search/hyperrag`,
      already do this)
## 7. AR-07 — OAK evidence enrichment adapter (NOT DONE — AR-01's client exists but isn't wired
      into any retrieval/candidate path yet)
## 8. AR-08 — HyperGraphRAG n-ary action expansion (NOT DONE)
## 9. AR-09 — CandidateFeatureMatrix action features (NOT DONE)
## 10. AR-10 — Tang low-rank recommendation challenger scaffold (NOT DONE)
## 11. AR-11 — DSPy program/eval snapshot contract (NOT DONE)
## 12. AR-12 — GEPA offline optimization harness scaffold (NOT DONE)
## 13. AR-13 — Agentic DAG synthesis (PARTIALLY BUILT, DORMANT — see section 18.3:
      `mastra-workflow-compiler.ts`/`workflow-spec-builder.ts` exist, zero live callers found)
## 14. AR-14 — ParameterResolver wiring (NOT DONE)
## 15. AR-15 — bounded repair-loop fixture (TS2345 deterministic fixture) (NOT DONE)
## 16. AR-16 — ExecutionReceipt → HyperEdge projection (NOT DONE)
## 17. AR-17 — ContextManifest/PromptPlan integration (PARTIALLY BUILT, DORMANT — see section
      18.3: `prompt-plan.ts` exists with zero live callers found outside its own directory)

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
- [x] 18.3 **Follow-up audit completed (same day): confirmed which parts are live vs. dormant,
      not left as a vague "might overlap" flag.**
      - **`classifyAtlasQuery` (`query-classifier.ts`) + `buildRetrievalPlan` (`retrieval-plan.ts`)
        are LIVE** — real production caller confirmed: `src/routes/api/search/hyperrag/+server.ts`
        imports and calls both directly. **This means AR-06 ("Go Retrieval → canonical candidate
        adapter") is effectively already satisfied by this existing pipeline** — building a
        second adapter would be a direct duplicate, not a gap-fill. AR-06 is now reclassified
        `SUPERSEDED_BY_EXISTING_OWNER`, not `NOT_DONE`.
      - **`prompt-plan.ts`, `workflow-spec-builder.ts`, `mastra-workflow-compiler.ts` are built
        but NOT wired to any live HTTP route** — confirmed via `grep`: they're only referenced
        from within the directory itself (`index.ts` barrel, `invalidation-plan.ts`'s internal
        import), no external caller found. These partially satisfy AR-13 (DAG synthesis) and
        AR-17 (PromptPlan integration) in spirit, but as dormant code, same "well-built, not
        fully wired" pattern found repeatedly this session for other subsystems (OAK kernel,
        `OntologyLinkedTupleV1`, etc.).
      - **Found the natural AR-07 (OAK evidence enrichment) integration point, and why it wasn't
        wired this pass**: `QueryClassificationV1.domains` is populated by a tiny, hardcoded
        4-keyword regex check (`parent-atlas`/`cache`/`retrieval`/`workflow` — see
        `query-classifier.ts` lines ~43-47), unrelated to and much narrower than
        `atlas_domain_ontology`'s 17-concept vocabulary or the OAK kernel. It is a legitimately
        different, narrow purpose (retrieval-strategy routing hint, not a concept taxonomy) —
        not itself a duplicate needing reconciliation. But it IS where AR-07 would plug in.
        **Not wired this pass**: `classifyAtlasQuery` is fully synchronous (regex-only, no I/O);
        adding a real OAK/resolver call would force it async, a breaking change to a live,
        production hyperrag route with a caller (`+server.ts`) that currently calls it
        synchronously. Changing a live route's execution model is exactly the kind of action
        this session's evidence discipline says needs deliberate review, not a same-pass
        drive-by edit.
      - **Conclusion: do not touch `agentic-file-compiler/` further without a dedicated,
        carefully-scoped session** that (a) decides whether AR-07's OAK enrichment becomes an
        async post-classification step (not inside `classifyAtlasQuery` itself) and (b) decides
        whether to wire `prompt-plan.ts`/`mastra-workflow-compiler.ts` to a live caller or leave
        them for a future gate. Neither decision was made or acted on this pass.

## 19. NEXT STEPS (resume point — recorded 2026-09-15 ahead of a rate-limit pause)

Current state in one line: **2/17 gates built and tested (AR-01, AR-03), 1 gate found already
satisfied by existing live code (AR-06), 2 gates found partially built but dormant (AR-13, AR-17),
12 gates genuinely untouched (AR-02, AR-04, AR-05, AR-08, AR-09, AR-10, AR-11, AR-12, AR-14, AR-15,
AR-16, plus the AR-07 integration decision).** Everything below is a real open decision, not
implied — pick up by asking the operator which to do first, don't guess.

**Two concrete follow-on options identified but NOT started (from section 18.3):**
1. Wire AR-07 (OAK evidence enrichment) as a NEW async step placed AFTER `classifyAtlasQuery`
   returns (never inside it — `classifyAtlasQuery` must stay synchronous, it's live on
   `/api/search/hyperrag/+server.ts`). Would call
   `resolveOakEvidenceV1()`/`resolveOakAncestorsV1()` (already built, AR-01,
   `sveltekit-frontend/src/lib/server/atlas/agentic/oak-resolution-evidence-client.ts`) on the
   classified query's `domains`/`targetHints`/`symbols`, producing `OakResolutionEvidenceV1`
   records the hyperrag route could optionally attach to its response — additive, not a
   replacement for the existing 4-keyword `domains` regex.
2. Decide whether to wire `prompt-plan.ts` + `mastra-workflow-compiler.ts` (AR-13/AR-17, built,
   tested, zero live callers) to an actual HTTP entry point, or leave them dormant until a
   specific caller needs them. This is an architecture decision for the operator, not something
   to infer.

**Untouched gates, in the order the operator's own spec implies dependency (do not start out of
order without a reason — e.g. AR-04 blocks AR-08, AR-11/12 block nothing else and can run
independently):**
- AR-02 — Postgres-vs-code-defined decision for the action registry (blocks nothing else
  immediately; `AGENTIC_ACTION_REGISTRY_V1_SEED` from AR-03 works fine code-defined for now).
- AR-04 — `AgenticHyperEdgeV1` shape decision (new contract vs. modifying `HyperedgeV1`) — blocks
  AR-08 (HyperGraphRAG n-ary action expansion).
- AR-05 — bitencoded capability mask + CPU parity proof — independent, can start anytime.
- AR-08 — HyperGraphRAG n-ary action expansion — blocked on AR-04.
- AR-09 — CandidateFeatureMatrix action features — likely depends on AR-05's bitmask shape.
- AR-10 — Tang low-rank recommendation challenger scaffold — independent research-adjacent gate;
  operator explicitly said no promotion without a CPU exact-scoring oracle comparison.
- AR-11/AR-12 — DSPy program contract + GEPA offline harness scaffold — independent of everything
  else; explicitly offline-only, never touches canonical identity.
- AR-14 — ParameterResolver wiring — depends on AR-09's feature-matrix shape existing first.
- AR-15 — bounded TS2345 repair-loop fixture — the integration test that exercises AR-01, AR-03,
  and whichever of AR-04/08/09/13 exist by the time it's attempted; natural gate to build once a
  handful of the others land, not first.
- AR-16 — ExecutionReceipt → HyperEdge projection — depends on AR-04's hyperedge shape decision.

**Do not, on resume:** re-run the `agentic-file-compiler/` audit (section 18 is complete and
current as of this commit); re-litigate the OAK-kernel-duplication correction (already resolved,
`parent-atlas-ontology-oaklib-fanout-bitmap` tasks.md section 7); re-implement AR-01 or AR-03
(done, tested, committed `03d08c3e95`).
