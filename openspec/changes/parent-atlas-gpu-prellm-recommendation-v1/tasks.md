## 1. Locate and inventory the download — done

- [x] 1.1 Found the pack already extracted at `~/Downloads/parent-atlas-gpu-prellm-v1/` (plus its
      `.zip`). Read `manifest.json` (17 real files + 4 `__pycache__/*.pyc`, `writesToUserRepo: false`)
      and `README.md` (goals, non-goals, architecture diagram, GPU-lane mapping, suggested proof
      gate names) in full before touching anything.

## 2. Duplication check before copying anything in — done

- [x] 2.1 Grepped the live repo for every proposed contract name
      (`ReductionPolicyV1`/`TaxonomyScopeV1`/`QueryExpansionBundleV1`/`LowRankHelperRecommenderV1`/
      `DagTimeBudget`/`GpuCapabilityMatrix`) before reading any pack file in detail. Found a real
      naming-adjacent hit: `QueryTaxonomyScopeV1` already exists in
      `src/lib/server/atlas/classification/reduction-router-v1.ts`.
- [x] 2.2 Read `reduction-router-v1.ts` and `query-router-control-plane-v2.ts` in full to determine
      whether this is a genuine duplicate. **Confirmed NOT a duplicate**: the existing
      `QueryTaxonomyScopeV1`/`ReductionRouterPlanV1` serve the **V2** classification lineage
      (`query-classification-v2.ts`); the pack's `TaxonomyScopeV1`/`ReductionPolicyV1` target the
      **V1** lineage (`query-classifier.ts`/`retrieval-plan.ts`). Verified both lineages have real,
      live callers (`grep -rl` for each import path): V1 → `routes/api/search/hyperrag/+server.ts`
      + `agentic-file-compiler/index.ts`; V2 → `query-router-control-plane-v2.ts`,
      `reduction-router-v1.ts`, `retrieval-executor-policy-v2.ts`. Both real, neither dead.
      Recorded the distinction as an explicit code comment in the landed `taxonomy-scope-v1.ts`
      rather than leaving it only in this tasks.md.

## 3. Verify the manifest's `pythonChecks: PASS` claim and the 7 named corrections — done

- [x] 3.1 Independently re-ran `py_compile` on all 4 Python scripts (Windows Python 3.13.5, no
      python3 on this machine's Git Bash — used `python` directly) — all 4 syntax-clean,
      confirming the manifest's claim rather than trusting it.
- [x] 3.2 Actually executed 2 of the 4 scripts against their own example fixtures (not just
      syntax-checked): `grpo_policy_shadow_v1.py` against `examples/grpo-shadow-input.json` (real,
      sane group-relative-advantage output) and `low_rank_helper_recommender_v1.py --cpu` against
      `examples/low-rank-input.json` (this is what surfaced the zero-fill bug concretely — see 4.1).
- [x] 3.3 Verified each of the 7 named corrections against the actual downloaded file content
      (not the operator's description alone) — read every real source file in the pack before
      concluding anything:
      1. Zero-fill in the low-rank fitter: **confirmed real**, `matrix = np.zeros(...)` with only
         observed cells explicitly set (line 82/96 of the original file).
      2. Missing SVD sign canonicalization: **confirmed real**, no canonicalization step anywhere
         in the original `_cpu_svd`/`_try_gpu_svd`.
      3. Naive `predictedRemainingMs = criticalPathMs - elapsedMs`: **confirmed real**, exact
         formula present in the original `dag-time-budget-v1.ts`.
      4. OAK gate overclaiming relationship validation: **confirmed real**, module docstring says
         "validates ontology references and relationships," implementation only calls
         `adapter.label(curie)`.
      5. `requiresMutation` unsafe cast: **confirmed real**, and confirmed the field is already
         properly typed on the real `QueryClassificationV1` interface
         (`query-classifier.ts:18`) — the cast was not merely stylistic, it was masking access to
         an already-available, already-typed field.
      6. Hardcoded `1e-6` PageRank tolerance with no top-K check: **confirmed real**, exact
         `args.tolerance` default and comparison logic present in the original probe script.
      7. Ewin Tang citation correction (arXiv:1807.04271): not independently re-verified against
         arXiv in this pass — recorded as operator-asserted.
- [x] 3.4 **Found and confirmed one additional real bug independently, not one of the 7**: ran the
      original `networkx_cugraph_backend_probe_v1.py` against a synthetic 3-node graph on this
      machine (confirmed via `python -c "import nx_cugraph"` / `import cugraph` that neither
      package is installed) and observed it report `gpuStatus: "AVAILABLE"` with a fabricated
      "647x speedup" — NetworkX 3.3's backend dispatch silently falls through to CPU rather than
      raising when a named backend is unavailable, which the original `try/except` incorrectly
      assumed would raise.

## 4. Fix confirmed defects before landing — done

- [x] 4.1 Rewrote `scripts/atlas/gpu/low_rank_helper_recommender_v1.py`: replaced ordinary SVD
      (which cannot express masking) with masked alternating least squares, shared between CPU
      (numpy) and GPU (CuPy) via one `xp` parameter; added per-component sign canonicalization;
      added a `reconstructionChecksum` of the rounded reconstructed matrix; added per-cell
      `observed: boolean` in a new `reconstruction` array so consumers can distinguish real
      receipts from inferred estimates. **Live before/after comparison**: on the pack's own
      `examples/low-rank-input.json` (2 genuinely missing cells: analyze×TS_MORPH,
      repair×GRAPH), the fixed fitter reconstructs observed cells tightly (e.g. analyze×AST_GREP
      0.95 observed → 0.944 reconstructed; repair×TS_MORPH 0.96 → 0.952) and marks both missing
      cells `"observed": false` rather than silently treating them as equally-confident zero
      recommendations.
- [x] 4.2 Fixed `scripts/atlas/gpu/networkx_cugraph_backend_probe_v1.py`: default tolerance
      widened `1e-6` → `1e-4` (documented as float32-accumulation-appropriate, still overridable
      and always reported), added `topKIdentityMatch`/`topKOrderMatch` as separate reported
      signals, and added an `importlib.util.find_spec` pre-check so `GPU_UNAVAILABLE` is reported
      correctly instead of a false `AVAILABLE`. **Live verification**: re-ran against the same
      synthetic graph — now correctly reports `GPU_UNAVAILABLE` with an honest reason string.
- [x] 4.3 Fixed `scripts/atlas/ontology/oak_validation_lane_v1.py`: renamed the receipt schema to
      `parent-atlas.oak-concept-resolution-receipt.v1`, added `gate: "OAK_CONCEPT_RESOLUTION_PROVEN"`
      and `relationshipValidationImplemented: false` fields, renamed `validate()` →
      `resolve_concepts()`, rewrote the docstring to describe only what the code actually proves.
      Not execution-tested (requires a real `oaklib` ontology adapter/descriptor, out of scope for
      this review) — syntax-verified only (`py_compile` clean).
- [x] 4.4 Fixed `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/reduction-policy-v1.ts`:
      removed the `as unknown as {...}` cast, reads `input.classification.requiresMutation`
      directly.
- [x] 4.5 Fixed `sveltekit-frontend/src/lib/server/atlas/orchestration/dag-time-budget-v1.ts`:
      added `remainingCriticalPath()`, recomputing the critical path over only unfinished nodes;
      `estimateDagProgressV1` now calls it instead of the naive subtraction.
- [x] 4.6 Minor quality fix in passing (not one of the 7, found while reading the file): 
      `query-expansion-v1.ts`'s checksum preimage used plain `JSON.stringify` (no canonical key
      ordering guarantee) — replaced with a sorted-key `stable()` function matching the existing
      convention already used in `reduction-router-v1.ts`.
- [x] 4.7 Landed unchanged (no defects found on review): `gpu-capability-matrix-v1.ts` (the
      presentation-boundary guard is correct and matches this repo's existing GPU/CPU and
      ACE-naming-collision cautions), `low-rank-helper-recommender-v1.ts` (TS scoring side —
      the bug was entirely on the Python fitting side), `grpo_policy_shadow_v1.py` (correct
      group-relative-advantage math, honest `SHADOW_ONLY`/`training: false` labeling),
      `docs/architecture/rtx-visual-enhancement-boundary-v1.md` (accurate DLSS/RTX capability
      mapping, correctly notes DLSS Frame Generation should not be targeted on this RTX 3060 Ti),
      both example JSON fixtures.

## 5. Land and verify — done

- [x] 5.1 Copied all 12 real (non-`.pyc`) files into the repo at their pack-specified paths (no
      path collisions found in the pre-copy check). Skipped the 4 `__pycache__/*.pyc` files
      (build artifacts, never belong in version control) and the pack's own `manifest.json`
      (describes the download delivery, not a repo contract).
- [x] 5.2 Syntax-verified every landed file from its final repo location: `esbuild --bundle`
      transform check on all 6 TypeScript files (clean, 0 errors) and `python -m py_compile` on
      all 4 Python files (clean, 0 errors).
- [x] 5.3 Re-executed both runnable Python scripts from their final repo paths against the landed
      example fixtures (`examples/low-rank-input.json`, `examples/grpo-shadow-input.json`) —
      both produce the same verified-correct output as the pre-copy fixed-file test runs.
- [x] 5.4 Confirmed via `git status --porcelain` that all 12 files landed as new/untracked, and
      that this pass touched zero existing files outside this change's own new files.
- [x] 5.5 `npx openspec validate parent-atlas-gpu-prellm-recommendation-v1 --strict` — passes.

## 6. V2 pack discovered and reviewed — a residency-scheduler capability, plus a real found-by-running bug

- [x] 6.1 The operator pointed out a second download, `~/Downloads/parent-atlas-gpu-prellm-v2.zip`,
      not checked before task groups 1-6 above landed v1. Diffed every file shared between v1 and
      v2 (`diff` on each of the 10 shared filenames): **9 of 10 are byte-identical**; only
      `dag-time-budget-v1.ts` differs, and v2's copy is the **original, unfixed** version (still
      has the naive `criticalPathMs - elapsedMs` formula) — confirms this session's fix in task
      4.5 was not redundant and v2 did not independently fix it.
- [x] 6.2 Discovered mid-review that a concurrent session (the operator, confirmed) was actively
      rewriting `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/` at the same time —
      `taxonomy-scope-v1.ts` and `query-expansion-v1.ts` were overwritten on disk with a different,
      more complete implementation (Zod-validated, real query-term-to-feature/API matching) while
      this review was in progress, and `retrieval-plan.ts`/`prompt-plan.ts` were also being
      modified. Per instruction, did not revert or fight this — paused all further edits to that
      specific directory and did not re-land v1's original `taxonomy-scope-v1.ts`/
      `query-expansion-v1.ts`/`reduction-policy-v1.ts` content over it. Those three files' final
      state is now owned by that concurrent work, not this change.
- [x] 6.3 Reviewed v2's 9 new files (the "query-as-camera" residency scheduler this session had
      independently reviewed as a *design* in `parent-atlas-memory-architecture-freeze` addendum 9
      — this is the real implementation of that design): `query-viewport-v1.ts`,
      `execution-headroom-v1.ts`, `execution-parallelism-v1.ts`, `retrieval-execution-request-v1.ts`,
      `retrieval-execution-receipt-v1.ts`, `packet-lod-v1.ts`, `prefetch-prediction-v1.ts`,
      `residency-scheduler-v1.ts` + its `.spec.ts`, `residency-scheduler-boundary-v1.md`,
      `prove-residency-scheduler-v1.mjs`, `examples/residency-cagra-selector-v1.json`. No path
      collisions in the live repo for any of these 12 files.
- [x] 6.4 **Duplication check**: `ResidencySchedulerV1`/`PacketLodV1` conceptually overlap with two
      already-existing residency contracts found via targeted grep before reading further:
      `LodPromotionDecisionV1` (`sveltekit-frontend/src/lib/server/atlas/tensors/lod-promotion-contract.ts`,
      states `COLD | WARM | HOT` + a separate `representation` axis, a per-transition RECEIPT with
      byte accounting) and `planLodPromotion()` (`sveltekit-frontend/src/lib/server/atlas/tensors/ace-lod-promoter.ts`,
      states `RESIDENT | IN_USE` on `TensorTileManifest`, a GPU-tile-specific promote/keep/demote
      DECISION function). v2's own `ResidencyStateV1` (`packet-lod-v1.ts`) adds a **third** distinct
      vocabulary: `ABSENT | COLD | WARM | HOT_CPU | HOT_GPU | CONSUMED`. **Not resolved as
      duplicate-vs-layered in this pass** — plausible reading is that `ResidencySchedulerV1` is a
      broader, packet/resource-level policy layer that could hand off a `HOT_GPU` promotion to the
      narrower, already-existing `ace-lod-promoter.ts` for actual GPU-tile-capacity enforcement,
      but nothing wires that composition today, and none of the three vocabularies map cleanly onto
      each other (`HOT_CPU`/`HOT_GPU` vs. plain `HOT`; `RESIDENT`/`IN_USE` vs. `HOT_GPU`/`CONSUMED`).
      **Recorded as an open architecture question, not silently resolved** — see design.md.
- [x] 6.5 **Verified `SearchRuntime` really exists as the claimed sole retrieval/fusion owner**:
      `grep`-confirmed a real, substantial 14-file `sveltekit-frontend/src/lib/server/atlas/retrieval/`
      subsystem with that name. `RetrievalExecutionRequestV1`'s builder hardcodes
      `fusionOwner: 'SEARCH_RUNTIME'` and `semanticVoteCount: 1` as literal types — a genuinely
      well-designed anti-duplication guardrail baked into the type contract itself, not just a
      comment.
- [x] 6.6 **Found a real bug by actually running the code, not just reading it** (matching this
      repo's own Agent Execution Integrity discipline). `residency-scheduler-v1.spec.ts` asserts
      `card:caller-metadata` and `card:cagra-capability` end up `WARM`, matching
      `examples/residency-cagra-selector-v1.json`'s `expected.WARM` list. Ran `scheduleResidencyV1()`
      directly (via `tsx`, bypassing this repo's currently-broken vitest bootstrap — see 7.7) against
      the exact fixture values in the spec: **both candidates actually resolve to `HOT_CPU`**
      (scores 0.789 and 0.752, both clearing `hotPromoteThreshold: 0.75`), not `WARM` as asserted.
      This spec would fail if actually run. The delivered pack's own "proof" of this capability does
      not hold up under execution — recorded as a genuine, unresolved defect, not silently fixed by
      guessing at intended threshold/weight values (that's a tuning decision for whoever owns this
      capability's intended behavior, not something to reverse-engineer from one failing example).
- [x] 6.7 **Also found**: this repo's vitest bootstrap is currently broken independent of anything
      in this change (`Cannot find package '@rollup/plugin-node-resolve' imported from
      @sveltejs/adapter-node`) — could not run the spec via `npx vitest run` at all; had to write a
      standalone `tsx` script importing the module directly to get real execution evidence. This
      pre-existing environment issue is out of scope to fix here but blocks running ANY vitest spec
      in this repo right now, not just this one — worth flagging to the operator separately.
- [x] 6.8 **`prove-residency-scheduler-v1.mjs` does not actually prove the scheduler is correct** —
      read closely, it only validates the example fixture's own internal consistency (no duplicate
      resource refs across HOT/WARM/COLD, valid probability ranges) and computes a checksum of the
      fixture. It never calls `scheduleResidencyV1()` and compares its output against
      `expected`. Its emitted status name (`RESIDENCY_FIXTURE_DETERMINISTIC`) is honestly scoped —
      it doesn't claim scheduler correctness — but is easy to misread as a scheduler proof at a
      glance, especially since 7.6 shows the scheduler does NOT currently match this fixture.
- [x] 6.9 Minor, non-blocking observation: `execution-headroom-v1.ts` declares
      `reserveGpuBytes`/`reserveContextTokens` on `ExecutionHeadroomV1` but `remainingHeadroomV1()`
      never subtracts them — currently inert fields, presumably meant for a future caller to apply
      manually. Not fixed (unclear what "reserve" should mean without knowing the intended
      semantics — subtract always, or only under memory pressure).
- [x] 6.10 Landed all 12 v2 files as-is (no code changes applied to them this pass) — the confirmed
      defect (7.6) is a design/tuning question, not a mechanical bug with an obvious one-line fix
      like the v1 corrections were. `openspec validate --strict` still passes with these landed
      unfixed, since the spec.md below scopes this capability's proof status honestly as unproven.

## 7. Explicitly not done — deferred, not silently skipped

- [ ] 7.1 No wiring into any live path. The suggested proof-gate sequence from the pack's own
      README (`AFC-05I` `REDUCTION_POLICY_V1_PROVEN` → `AFC-05J` `TAXONOMY_SCOPE_V1_PROVEN` →
      `AFC-05K` `QUERY_EXPANSION_PROVENANCE_PROVEN` → `AFC-05L`
      `LOW_RANK_HELPER_RECOMMENDER_SHADOW_PROVEN` → `AFC-05M` `DAG_TIME_ESTIMATE_REPLAY_PROVEN` →
      `AFC-05N` `NETWORKX_CUGRAPH_BACKEND_PARITY_PROVEN` → `AFC-05O`
      `OAK_VALIDATION_LANE_PROVEN` [now `OAK_CONCEPT_RESOLUTION_PROVEN` per 4.3] → `AFC-05P`
      `GRPO_POLICY_SHADOW_EVAL_PROVEN` → `RTX-UI-01` `VISUAL_ENHANCEMENT_BOUNDARY_PROVEN`) is
      recorded here as a candidate future sequence, not started.
- [ ] 7.2 Real GPU-backed execution of the low-rank fitter (CuPy path) and the NetworkX/cugraph
      parity probe (against a real WSL2 `atlas-rapids-cu13` environment, per this repo's own
      GPU-MINI-FABRIC-01 precedent) was not attempted — this Windows Python 3.13 environment has
      neither `cupy` nor `cugraph`/`nx_cugraph` installed. Both scripts correctly fall back to
      CPU-only behavior when unavailable (verified live), but neither has been proven on the real
      GPU lane yet.
- [ ] 7.3 The Ewin Tang citation (arXiv:1807.04271) was not independently checked against arXiv.
- [ ] 7.4 Whether the V1 classification lineage should eventually be retired in favor of V2 is an
      open operator question, explicitly not decided here (see design.md Open Questions).

## 8. Vitest bootstrap fixed, residency-scheduler defect now harness-confirmed — done

- [x] 8.1 Root cause found for the repo-wide `Cannot find package '@rollup/plugin-node-resolve'
      imported from .../node_modules/@sveltejs/adapter-node/index.js` failure blocking every
      vitest spec (not just this capability's — flagged as pre-existing/out-of-scope in 7.7's
      original framing). `sveltekit-frontend/svelte.config.js` imports `@sveltejs/adapter-node`
      directly, but that package was never declared in `sveltekit-frontend/package.json` and was
      absent from `sveltekit-frontend/node_modules`. Node's ESM resolver was falling through to a
      stale, undeclared, orphaned copy of `@sveltejs/adapter-node@5.4.0` sitting in the parent
      repo's root `node_modules` (not referenced by root's own `package.json`/`package-lock.json`
      either) — and that stale copy was itself missing its own `@rollup/plugin-commonjs` /
      `@rollup/plugin-node-resolve` / `@rollup/plugin-json` transitive dependencies.
- [x] 8.2 Fixed by adding `@sveltejs/adapter-node@5.4.0` (matching the stale root copy's version,
      itself already compatible with the installed `@sveltejs/kit@2.59.1` per its `^2.4.0` peer
      range) as a real devDependency directly in `sveltekit-frontend/package.json`, installed via
      `npm install --save-dev @sveltejs/adapter-node@5.4.0` run from `sveltekit-frontend/` (not
      root) — 10 packages added, 1 removed, 6 changed, zero root `node_modules`/root
      `package.json` changes. This is a real, minimal, already-declared-by-`svelte.config.js`
      dependency being correctly installed in the project that actually uses it — not a new
      capability, not touching this change's own landed files.
- [x] 8.3 Verified by real execution, not assumption: `npx vitest run
      src/lib/server/atlas/residency/residency-scheduler-v1.spec.ts` now boots cleanly (no
      `ERR_MODULE_NOT_FOUND`) and actually runs the test. Result matches the earlier standalone
      `tsx`-based scratch-script finding exactly:
      `expected 'HOT_CPU' to be 'WARM' // Object.is equality` at
      `residency-scheduler-v1.spec.ts:155` (`card:caller-metadata`) — the real vitest harness now
      independently confirms the same defect recorded in section 6 and in
      `specs/gpu-prellm-recommendation/spec.md`'s "residency scheduler's proof status is reported
      honestly" requirement. No code in `residency-scheduler-v1.ts` or its spec was changed as
      part of this fix — re-tuning weights/thresholds to make the spec pass remains an explicit
      design-intent decision for whoever set the intended behavior (see design.md Open Questions),
      not something to guess at from one failing example.
- [x] 8.4 This fix is repo-wide, not scoped to this change — every other vitest spec in
      `sveltekit-frontend` that was previously unable to even start can now run. No other spec
      suites were run as part of this task; only the one directly relevant to this capability's
      own unproven claim was re-verified.
