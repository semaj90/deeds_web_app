# Tasks

## PRT0 — Ownership and prerequisite gate
- [x] Locate canonical workflow estimator/router and ACE materializer before integration edits.
  Found (2026-08-31, doc-accuracy pass): `runSemanticSearchWorkflow()` in
  `sveltekit-frontend/src/lib/server/retrieval/semantic-search-workflow.ts` is the canonical
  workflow router — confirmed as the sole implementation called by
  `src/routes/api/retrieval/search-unified/+server.ts` (the documented canonical retrieval
  endpoint per root CLAUDE.md). ACE materializer is
  `sveltekit-frontend/src/lib/server/ace/ace-materializer.ts` (has a paired `.spec.ts`).
- [x] Confirm Patch H remains blocked or proven truthfully; do not assume betweenness exists.
  Checked (2026-08-31): Patch H (betweenness / GA7) is **`RUNTIME_SMOKE_PROVEN`**, not blocked —
  per `openspec/changes/parent-atlas-graph-analysis-contract/tasks.md`, 7/7 verifier gates pass,
  `metricsWritten: 58546` matching `distinctPackets` exactly. This supersedes this change's own
  README.md line 5 ("betweenness-dependent graph features remain blocked until Patch H is
  proven") — that blocking condition is now satisfied. Any policy-layer graph feature gated on
  betweenness is unblocked, though PRT8 (geometry/SOM) and PRT3 (finite policy) should still
  independently verify their own specific feature inputs before consuming it, per this file's
  own "no geometry-derived production feature before GA8-style ablation" caution — GA8 (the
  per-feature ablation ground truth) is separately still an open blocker in that other change
  (`parent-atlas-graph-analysis-contract`'s "Patch I" section), so "betweenness is computed" and
  "betweenness is validated as a useful policy feature" are not the same claim.
- [x] Confirm canonical retrieval/RRF/rerank owners remain unchanged.
  Confirmed live (2026-08-31): `canonical-rerank-executor.ts` and `runtime-reranker.ts` both
  still exist at `sveltekit-frontend/src/lib/server/retrieval/` — no ownership churn since the
  Aug 9 audit that established them as canonical (root CLAUDE.md's "14 reranker files" finding).

## PRT1 — Policy state tensor
- [x] Add ~30-feature `PolicyStateTensor` contract.
- [x] Preserve separate semantic, feature, HMM, graph, and resource domains.
- [x] Add finite-range normalization metadata with epsilon only for numerical stability.
  Proof: `sveltekit-frontend/src/lib/server/atlas/policy/policy-state.ts`
  + `policy-state.spec.ts` passed.

## PRT2 — HMM bridge
- [x] Consume existing OKF fit decision + HMM observation/stateHint.
- [x] No duplicate HMM state estimator.
- [x] Test ACCEPT/REVIEW/ABSTAIN path into policy state.
  Proof: `sveltekit-frontend/src/lib/server/analysis/hmm-policy-bridge.ts`
  + `hmm-policy-bridge.spec.ts` passed.

## PRT3 — Finite policy
- [ ] 12 allowed actions.
- [ ] 3 model targets: NO_LLM / ORNITH / GEMMA4.
- [ ] 3 budget tiers.
- [ ] State-specific action masks.
- [ ] Deterministic baseline before learned weights.

## PRT4 — Bounded concurrency
- [x] Atlas owns max parallel tool calls (default 3).
- [x] Resource semaphores: IO/CPU/GPU/LLM.
- [x] GPU_HEAVY=1 and LLM=1 baseline.
- [x] Dependency/cycle tests.
  Proof: `sveltekit-frontend/src/lib/server/atlas/policy/execution-control.ts`
  + `execution-control.spec.ts` passed, plus
  `sveltekit-frontend/src/lib/server/atlas/policy/bounded-executor.spec.ts`
  now proves dependency cycle rejection.

## PRT5 — Canonical async reducer
- [x] Join pass results by request_id + packet_key + revision tuple.
- [x] Reject duplicate pass contributions.
- [x] Prove shuffled completion order gives identical materialization.
- [x] Stable final ranking only after semantic correctness.
  Proof: `sveltekit-frontend/src/lib/server/atlas/policy/canonical-reducer.ts`
  + `canonical-reducer.spec.ts` passed, and
  `sveltekit-frontend/src/lib/server/analysis/nlp-feature-compiler.ts`
  now canonicalizes pass ordering before matrix compilation with
  `nlp-feature-compiler.spec.ts` proving shuffled completion invariance.

## PRT6 — ACE residency
- [x] Add versioned residency manifest.
- [x] Select real fidelity units, not fractional tensor bytes.
- [x] Enforce byte budget and utility/byte baseline.
  Proof: `sveltekit-frontend/src/lib/server/atlas/policy/ace-residency.ts`
  + `ace-residency.spec.ts` passed.
  Proof: `sveltekit-frontend/src/lib/server/atlas/policy/ace-residency.ts`
  + `ace-residency.spec.ts` passed.

## PRT7 — Offline policy training
- [x] Export RouteTrace rows only after labels are provenance-backed.
- [x] Train tiny action/model/budget heads.
- [x] Compare deterministic vs learned held-out accuracy and repair success.
- [x] Load replay rows from JSONL with malformed-line skipping.
- [x] Persist a versioned policy-head artifact from replay rows.
- [ ] DSPy remains program-optimization experiment.
- [ ] QLoRA only from non-quantized checkpoint with action mask preserved.
- [ ] PPO remains blocked until stable replayable reward environment exists.
  Proof: `sveltekit-frontend/src/lib/server/atlas/policy/policy-training.ts`
  + `policy-training.spec.ts` passed.
  Live path: `sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts`
  now appends provenance-backed training rows after rerank finalization.
  Proof: `sveltekit-frontend/src/lib/server/atlas/policy/policy-head-trainer.ts`
  + `policy-head-trainer.spec.ts` passed.
  Proof: `sveltekit-frontend/src/lib/server/atlas/policy/policy-training.ts`
  + `policy-training.spec.ts` passed for JSONL replay load.
  Proof: `sveltekit-frontend/src/lib/server/atlas/policy/policy-head-artifact.ts`
  + `policy-head-artifact.spec.ts` passed.

## PRT8 — Geometry/SOM experiment
- [ ] Prefer JVP/VJP sampled directional diagnostics over full Jacobian.
- [ ] Train SOM from KMeans centroids first.
- [ ] SOM 20x20 coordinates remain derived/not canonical.
- [ ] No geometry-derived production feature before GA8-style ablation.

## PRT9 — E2E
- [ ] error/query -> OKF -> HMM -> PolicyStateTensor -> finite decision -> bounded tools
- [ ] canonical reducer -> rerank/ACE -> model if needed -> compile/test -> RouteTrace
- [ ] same inputs/revisions produce same decision receipt under shuffled async completion.

## STOP CONDITIONS
Stop on unresolved graph revision, duplicate runtime owner, ambiguous representation revision,
unproven labels, unbounded tool recursion, or a geometry/SOM feature being treated as canonical truth.
