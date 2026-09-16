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
## 7. AR-07 — OAK evidence enrichment adapter

- [x] 7.1 Built `enrichQueryClassificationWithOakV1()`:
      `sveltekit-frontend/src/lib/server/atlas/agentic/oak-query-enrichment-v1.ts`. Takes an
      already-computed `QueryClassificationV1` (from the live `agentic-file-compiler/
      query-classifier.ts`), extracts distinct candidate labels from `domains`/`symbols`/
      `targetHints` (deduped, bounded by `maxLabels`, default 8), resolves each independently via
      AR-01's `resolveOakEvidenceV1()`. One label's failure never blocks the others (`Promise.all`
      over independently fail-closed calls, not a single all-or-nothing request).
      **Deliberately a standalone, additive module — not called from inside `classifyAtlasQuery`
      itself**, per last turn's finding: that function is synchronous and live on
      `/api/search/hyperrag/+server.ts`; forcing it async would be a breaking change to
      production code, not something to do as a drive-by edit.
- [x] 7.2 Unit-tested (mocked `fetch`) — 5/5 passing: resolves distinct labels independently,
      deduplicates across domains/symbols/targetHints, respects `maxLabels`, one failure doesn't
      block others, zero-candidate classification short-circuits without any fetch call.
- [ ] 7.3 **NOT DONE, deliberately**: wiring this into `/api/search/hyperrag/+server.ts` itself
      (or any other live caller). That remains the open decision flagged in section 18.3/19 —
      the adapter is ready to be called, but nothing calls it yet.
## 8. AR-08 — HyperGraphRAG n-ary action expansion (NOT DONE)
## 9. AR-09 — CandidateFeatureMatrix action features (NOT DONE)
## 10. AR-10 — Tang low-rank recommendation challenger scaffold (CENSUS COMPLETE, REAL/LIVE —
      see also claude.md's "Correction: Ewin Tang recommendation" note)

- [x] 10.1 **Corrected an earlier same-session finding.** "Ewin Tang's recommendation algorithm
      doesn't exist anywhere in this repo" (recorded 2 turns ago) was based only on
      `rg "ewin tang"` returning zero hits — a literal-name search, not a mechanism search. The
      operator correctly flagged this: `git log --all --oneline` for
      `python/atlas_compute/low_rank.py` and `**/sample-query-matrix-v1.ts` returns real prior
      commits (`feat(atlas): add low-rank and Tang-inspired comparison receipts`,
      `feat(atlas): add sample query matrix and length squared sampler`,
      `feat(atlas): prove semantic low-rank parity lineage`,
      `Repair SampleQueryMatrixV1 merge corruption`), plus a whole branch
      (`agent/ast-xgb-tang-alignment-20260822`). Real, mechanism-named machinery
      (`SampleQueryMatrixV1`, squared-L2/length-square sampling) existed, gated
      `canonicalIdentityAuthority: false`/`retrievalVoteAdded: false` — exactly the challenger-
      only pattern this gate's own design already called for.
- [x] 10.2 **The "empty find" note in 10.2 (prior revision) was ITSELF WRONG — corrected same
      day.** Two `find`s for `*sample-query-matrix*`/`low_rank.py` had been reported empty; a
      direct `Read`/`git ls-files`/`git log -- <path>` check shows all three files exist on
      `main` right now: `python/atlas_compute/low_rank.py` (267 lines),
      `sveltekit-frontend/src/lib/server/atlas/sampling/sample-query-matrix-v1.ts` (58 lines),
      `sample-query-matrix-v1.spec.ts` (17 lines). The `find`s were run wrong, not the files
      absent.
- [x] 10.3 **`TANG-LOW-RANK-OWNER-CENSUS-01` — COMPLETE, run for real (2026-09-15).**
      - `literalNameHits`: 0 in current tree (name never appears in code, by design)
      - `mechanismHits`: the 3 current files above + the git-log commit trail from 10.1
      - `currentFiles` / `historicalFiles`: identical — present, tracked, no divergence
      - `currentCallers`: **real**. `recommendation-evidence-bundle-v1.ts:3` imports
        `SampleQueryMatrixV1Schema`, embeds as nullable `sample` field in
        `RecommendationEvidenceBundle`. `python/prove_atlas_compute.py:30` imports
        `compare_low_rank_recommendations` as a CLI proof-receipt generator (`--low-rank` flag).
        Neither is a retrieval hot path.
      - `tests`: real — `sample-query-matrix-v1.spec.ts`, 2 assertions (length-squared
        probability computation, row-L2 degeneracy detection)
      - `receipts`: `LowRankComparisonReceipt`/`CandidateShortlistReceipt` (Python,
        `canonical_authority: False`), `SamplingDecisionV1` (TS, `canonicalIdentityAuthority:
        false`, `retrievalVoteAdded: false`)
      - `productionCaller`: no — challenger/evidence-bundle-only
      - `canonicalAuthority` / `retrievalVoteAdded`: `false` everywhere, by design
      - **Verdict: real, current, tested, correctly classified as `EXPERIMENT`/challenger
        evidence. Do not build a second low-rank/length-squared-sampling module — this is the
        one, and it already declines canonical authority correctly.**
- [x] 10.4 **Separate finding: a stale, more-advanced unmerged branch exists — flagged, NOT
      merged.** `origin/agent/sample-query-matrix-ewintang-20260822` (fetched + diffed vs `main`,
      2026-09-15): NOT an ancestor of `main`, diverges heavily overall (~311KB whole-repo diff,
      dated 2026-08-22, predates ~3 weeks of unrelated `main` churn) — merging it wholesale would
      be reckless, not attempted. But its versions of these 3 files are a real, more mature
      evolution: revision/checksum-qualified (`workspaceRevision`, `sourceMatrixRevision`,
      `sourceMatrixChecksum`), integrates with the real canonical `candidateOrdinalMapV1Schema`
      (`features/canonical-candidate-v1.ts`, confirmed present on `main`), and adds a
      `samplingEvaluationV1Schema` (length-squared vs. uniform vs. top-k-row-norm recall
      measurement — `main` has no equivalent). It also **renames** fields
      (`canonicalIdentityAuthority`→`identityAuthority`, `retrievalVoteAdded`→
      `retrievalVoteProduced`, adds `canonicalWritesAttempted`/`producerRevision`) and
      restructures `rows` — a breaking contract change relative to `main`'s current shape, which
      `recommendation-evidence-bundle-v1.ts` already depends on by the old names. **Real
      architecture decision (port forward vs. leave superseded) — flagged for the operator, not
      resolved here.**
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

## 19. NEXT STEPS (resume point — updated 2026-09-15, AR-07 adapter now built)

Current state in one line: **3/17 gates built and tested (AR-01, AR-03, AR-07's adapter), 1 gate
found already satisfied by existing live code (AR-06), 2 gates found partially built but dormant
(AR-13, AR-17), 11 gates genuinely untouched (AR-02, AR-04, AR-05, AR-08, AR-09, AR-10, AR-11,
AR-12, AR-14, AR-15, AR-16), plus 2 live-wiring decisions still open (AR-07's own adapter→route
wiring, and AR-13/17's dormant-code→route wiring).** Everything below is a real open decision, not
implied — pick up by asking the operator which to do first, don't guess.

**AR-07 status update: the adapter itself is now built and tested** (task 7.1/7.2,
`oak-query-enrichment-v1.ts`, 5/5 tests). What remains open is only the wiring decision:
1. Wire it into `/api/search/hyperrag/+server.ts` as a call AFTER `classifyAtlasQuery` returns
   (never inside it — that function must stay synchronous, it's live production code). Would call
   the now-built `enrichQueryClassificationWithOakV1()`
   (`sveltekit-frontend/src/lib/server/atlas/agentic/oak-query-enrichment-v1.ts`) on the
   classified query, producing `OakResolutionEvidenceV1[]` the route could optionally attach to
   its response — additive, not a replacement for the existing 4-keyword `domains` regex. Not
   done yet because touching a live production route's response shape needs explicit
   authorization, not a same-pass drive-by edit.
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
