## Context

`openspec/changes/parent-atlas-memory-architecture-freeze/proposal.md` addendum 9 recorded a
review of the operator's "camera/LOD" design framing and noted 7 correction claims against an
earlier GPU/pre-LLM patch this session could not locate in `sveltekit-frontend/src`. The operator
subsequently pointed at the actual delivery: `~/Downloads/parent-atlas-gpu-prellm-v1.zip`, a
self-contained "patch pack" (`writesToUserRepo: false` in its own manifest — it never touched the
repo on its own) with a `pythonChecks: [...PASS...]` claim for its 4 Python scripts. This change
is the review-and-land pass: verify the manifest's claims and the 7 corrections against the real
downloaded code (not trust either), fix what's confirmed broken, check for duplication against
the live repo before copying anything in, and land the result.

## Goals / Non-Goals

**Goals:**
- Verify, don't assume: every one of the 7 named corrections was checked against the actual
  downloaded file before being treated as real; the manifest's `pythonChecks: PASS` claim was
  independently re-run (`py_compile` + live execution against the pack's own example fixtures),
  not trusted at face value.
- Fix confirmed defects before landing the files, not after — this repo's own precedent
  (`ai-mem-prellm` upstream conversation) is "measure twice, cut once," not "land now, patch later."
- Check for capability-name collisions against the live repo before copying anything in
  (Duplication Prevention rule) — found one naming-adjacent-but-not-duplicate case
  (`TaxonomyScopeV1` vs. `QueryTaxonomyScopeV1`) and recorded the distinction explicitly rather
  than either merging them or silently landing a confusing near-duplicate name.
- Land the corrected pack as inert, unwired capability code — no existing file edited, nothing
  imported into a live path yet.

**Non-Goals:**
- Wiring any of this into the live `agentic-file-compiler` pipeline, `query-router-control-plane-v2`,
  or any ACE/retrieval consumer. That's separate, larger, and requires its own proof gates (see
  `tasks.md`'s suggested `AFC-05*`/`RTX-UI-01` sequence, none of which are started).
- Resolving the pre-existing V1-vs-V2 classification-lineage duplication (`query-classifier.ts` +
  `retrieval-plan.ts` vs. `query-classification-v2.ts` + `reduction-router-v1.ts`) — both are
  real, both have live callers, and this pack correctly targets the still-live V1 lineage rather
  than inventing a third one. Whether the repo should eventually retire V1 in favor of V2 is an
  operator decision this change does not make.
- Reproducing Ewin Tang's actual sampling-access recommendation algorithm — the low-rank fitter
  uses SVD/ALS and ℓ2-norm-weighted component contributions in the same *systems* spirit, and the
  pack's own README already disclaims the stronger theoretical claim; this change does not change
  that disclaimer's accuracy or attempt the real algorithm.
- Training or promoting anything — the low-rank artifact, the GRPO shadow evaluator, and the OAK
  lane all remain explicitly `SHADOW_ONLY`/`VALIDATION_ONLY`/`CONCEPT_RESOLUTION_ONLY` per their
  own emitted receipts, unchanged by this review.

## Decisions

- **Rewrite the low-rank fitter's factorization algorithm, not just patch around the zero-fill.**
  The originally-delivered code used ordinary SVD (numpy `linalg.svd` on CPU, cuML `TruncatedSVD`
  on GPU), neither of which has a masked/weighted-input mode — there is no way to "not zero-fill"
  while still calling those APIs on data with real gaps. The correct fix is a different algorithm
  (masked alternating least squares), which also has the useful side effect of using the *same*
  code on CPU (numpy) or GPU (CuPy) via one `xp` module parameter, rather than two structurally
  different code paths that could drift. Alternative considered: keep ordinary SVD but restrict to
  "sufficiently observed cohorts" (the operator's own offered simpler alternative) — rejected as
  the correct fix here because this pack's own example fixture has genuine, expected sparsity
  (not every task family will ever be tried against every helper), so dropping sparse rows/columns
  would silently lose real, useful signal rather than just avoiding fabricated signal.
- **Track and expose per-cell `observed: boolean` in the fitted artifact.** A masked factorization
  still *produces* a plausible value for every cell (that's what factorization is for) — but a
  downstream consumer needs to be able to tell "this came from real receipts" from "this is a
  low-rank inference for a combination we've never tried" before trusting it at the same
  confidence. Without this field, fixing the zero-fill bug internally would still leave callers
  unable to make that distinction.
- **Checksum the reconstructed matrix, not raw factor bytes.** SVD/ALS factors are only defined up
  to a per-component sign flip (and, for ALS specifically, up to a rotation within tied
  components) — two numerically-equivalent solutions can have different raw bytes. Canonicalizing
  sign per component removes most of the practical divergence; checksumming the reconstruction
  (which is invariant to sign flips by construction, since a flip pair cancels in the product)
  removes the rest, matching the operator's own stated principle ("checksum the
  reconstructed/ranked output, not raw factor bytes").
- **Fix the NetworkX backend-availability check independently discovered during verification**,
  even though it wasn't one of the 7 named corrections — found by actually running the probe
  script rather than only reading it, per this repo's own established Agent Execution Integrity
  discipline (a claim of "PASS"/"AVAILABLE" is not evidence; running it is).
- **Land as an OpenSpec change with an explicit `New Capabilities` entry, not as loose files.**
  Matches this repo's own governance convention (every prior addition this session went through
  OpenSpec) and gives future duplication checks a named place to look before someone re-derives
  or re-downloads an equivalent pack.

## Risks / Trade-offs

- [Risk: the masked-ALS rewrite changes the low-rank fitter's numerical behavior compared to what
  the operator may have separately validated against the delivered (buggy) version] → Mitigation:
  the change is disclosed explicitly and prominently in the file's own docstring and in this
  change's `proposal.md`/`tasks.md`, with a live before/after comparison recorded (see tasks.md) —
  not a silent behavior change.
- [Risk: dropping cuML `TruncatedSVD` as the GPU path (replaced by CuPy-based masked ALS) means the
  GPU lane no longer literally matches the README's original "cuML TruncatedSVD: fit the
  helper/task factor model" line] → Mitigation: recorded explicitly as a deliberate correction,
  not an oversight — cuML's `TruncatedSVD` has no masked-input mode, so it structurally cannot
  respect the "missing stays missing" rule; CuPy-based ALS is a legitimate GPU lane per the
  pack's own "CuPy: dense scoring / matrix ops" framing.
- [Risk: this pack introduces a fourth or fifth semi-parallel "reduction"/"taxonomy scope" concept
  without a strong enough boundary against future confusion] → Mitigation: explicit
  cross-referencing comment added in `taxonomy-scope-v1.ts` naming both concepts and lineages by
  file path, so a future duplication check finds the distinction already documented rather than
  having to re-derive it.

## Migration Plan

Not applicable — additive-only, no existing file modified, nothing wired into a live path yet.

## Open Questions

- Should the V1 classification lineage (`query-classifier.ts`/`retrieval-plan.ts`) eventually be
  retired in favor of V2, or are both intentionally permanent parallel lanes? Left to the operator
  — out of scope here. (As of this addendum, this question is also now entangled with a concurrent
  session actively rewriting `agentic-file-compiler/`'s `taxonomy-scope-v1.ts`/`query-expansion-v1.ts`/
  `retrieval-plan.ts`/`prompt-plan.ts` — see Addendum 1 below.)
- Which of the suggested `AFC-05I`..`AFC-05P`/`RTX-UI-01` proof gates (if any) should be opened
  next, and in what order relative to `parent-atlas-retrieval-lod-algorithm-taxonomy`'s existing
  `BF-LOD-03`–`06` work? Not decided in this change.
- **New, from the V2 residency-scheduler review**: which of the three now-existing residency-state
  vocabularies (`LodPromotionDecisionV1`'s `COLD|WARM|HOT` + representation axis;
  `ace-lod-promoter.ts`'s GPU-tile `RESIDENT|IN_USE`; v2's own `ResidencyStateV1`
  `ABSENT|COLD|WARM|HOT_CPU|HOT_GPU|CONSUMED`) is meant to be canonical, and how (or whether) the
  other two compose beneath it? Not decided here — this change only surfaces the ambiguity.
- Should `residency-scheduler-v1.ts`'s scoring weights/thresholds be re-tuned so its own delivered
  spec actually passes (see Addendum 1, task 7.6), or is the spec/fixture wrong instead? This is a
  design intent question this change cannot answer on the pack author's behalf.

## Addendum 1 (2026-09-06): V2 pack review — additive residency-scheduler capability, one confirmed
## unproven claim, one live concurrent-edit collision

The operator pointed out a second download (`parent-atlas-gpu-prellm-v2.zip`) not checked before
the original review above landed. Full findings in `tasks.md` section 7; summarized here for
design-level context:

- **V2 is additive, not a corrected v1.** 9 of 10 files shared with v1 are byte-identical; the
  10th (`dag-time-budget-v1.ts`) is v2's *original, unfixed* copy — this change's own fix (task
  4.5) was not made redundant by v2.
- **A concurrent session (the operator) is actively rewriting `agentic-file-compiler/`** with a
  materially different, more complete `taxonomy-scope-v1.ts`/`query-expansion-v1.ts`
  implementation (Zod-validated, real feature/API term matching) at the same time this review was
  running. Per the operator's own instruction, this change does not revert or race that work — the
  final state of those specific 3 files (`taxonomy-scope-v1.ts`, `query-expansion-v1.ts`,
  `reduction-policy-v1.ts`) is no longer this change's to own or correct going forward.
- **V2 adds a real implementation of the "query-as-camera" residency scheduler** this repo's own
  `parent-atlas-memory-architecture-freeze` addendum 9 reviewed as a design proposal: `QueryViewportV1`,
  `ExecutionHeadroomV1`, `ExecutionParallelismV1` (tau=3 fan-out, 4 CPU profiles, 1 GPU arbiter —
  matches this repo's own established fan-out cap), `RetrievalExecutionRequestV1`/`ReceiptV1`
  (hardcodes `fusionOwner: 'SEARCH_RUNTIME'`/`semanticVoteCount: 1` as literal types — a real
  anti-duplication guardrail, verified `SearchRuntime` genuinely exists as a 14-file subsystem),
  `PacketLodV1` (the LOD0-5 ladder from the earlier design review, now concrete), and
  `ResidencySchedulerV1`.
- **A genuine, confirmed-by-execution defect**: `residency-scheduler-v1.spec.ts` asserts two
  candidates resolve to `WARM`; running `scheduleResidencyV1()` directly against the exact fixture
  values shows they actually resolve to `HOT_CPU` (scores 0.789/0.752 both clear the 0.75 promote
  threshold). This capability's own delivered proof does not hold up under execution — landed
  anyway per the operator's "copy these over" instruction, but the spec's capability requirement in
  `specs/gpu-prellm-recommendation/spec.md` is written to reflect this as NOT YET PROVEN, not as a
  passing gate.
- **The standalone `prove-residency-scheduler-v1.mjs` doesn't call the scheduler at all** — it only
  checksums the fixture and validates its internal consistency, which is easy to misread as
  scheduler correctness at a glance. The real proof lives in the `.spec.ts` file.

## Addendum 2 (2026-09-06): repo-wide vitest bootstrap fixed; defect now harness-confirmed

The vitest bootstrap issue referenced above (Addendum 1, "a pre-existing environment issue...
blocking every vitest spec in the repo") is fixed — see `tasks.md` section 8. Root cause:
`sveltekit-frontend/svelte.config.js` imports `@sveltejs/adapter-node`, which was never declared
in `sveltekit-frontend/package.json` and was resolving, via Node's ESM module-resolution walk-up,
to a stale undeclared copy in the parent repo's root `node_modules` that was itself missing its
own `@rollup/*` transitive dependencies. Fixed by declaring and installing
`@sveltejs/adapter-node@5.4.0` directly in `sveltekit-frontend/package.json` — a real,
already-used-but-undeclared dependency, not a new capability, and not a change to any file this
capability landed.

With the bootstrap fixed, `residency-scheduler-v1.spec.ts` now runs under the real harness and
confirms the same defect the standalone script found: `card:caller-metadata` and
`card:cagra-capability` resolve to `HOT_CPU`, not the spec's expected `WARM`. This changes the
evidentiary basis (harness-confirmed instead of workaround-script-confirmed) but not the
conclusion — the residency-scheduler threshold/weight re-tuning question from Open Questions above
remains exactly as open as before; fixing the bootstrap does not, by itself, resolve a design-intent
question.
