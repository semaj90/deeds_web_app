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
- [x] 12 allowed actions — `POLICY_ACTIONS` is fixed at 12 entries.
- [x] 3 model targets: NO_LLM / ORNITH / GEMMA4 — fixed `MODEL_TARGETS`.
- [x] 3 budget tiers — fixed `BUDGET_TIERS` (SMALL / MEDIUM / DEEP).
- [x] State-specific action masks — focused test checks all six HMM states
  against their permitted actions before ranking.
- [x] Deterministic baseline before learned weights — focused test proves
  baseline-preferred actions for all six states with no learned weights.
  Proof: `sveltekit-frontend/src/lib/server/atlas/policy/policy-router.ts`,
  `policy-types.ts`, and `policy-router.spec.ts` (5/5 passed).

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
- [x] DSPy remains a program-optimization experiment. `DspyPolicyAuthorityV1`
  confines it to shadow/challenger use and forbids changing legal HMM
  transitions, bypassing exact promotion, authorizing mutation, or creating
  canonical facts. `aligned-policy-lanes.spec.ts` passed 7/7. No GEPA
  optimization, model call, or policy promotion was run.
- [ ] QLoRA only from non-quantized checkpoint with action mask preserved.
  Contract-only progress: `policy/qlora-admission-v1.ts` now rejects
  quantized source checkpoints and requires the exact current state-specific
  action-mask snapshot/checksum. Focused tests passed 4/4. This is not yet
  consumed by a QLoRA trainer; no training, model call, or promotion occurred,
  so this task remains open until an execution owner consumes the admission.
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
- [x] Prefer JVP/VJP sampled directional diagnostics over full Jacobian. **Verified 2026-09-27:** `directional-diagnostics.ts` accepts caller-owned JVP/VJP operators and explicit bounded samples (1–64), validates dimensions/finiteness, and emits derived norms without materializing a Jacobian or granting canonical authority. Focused policy tests passed 4/4. This proves the diagnostic contract/fixture only; no live autodiff backend or SOM training is claimed.
- [x] Train SOM from KMeans centroids first. **Synthetic handoff verified 2026-09-29:** the already-running cuVS 26.08 executor produced four centroids from the fixed 8×2 fixture (2 iterations); those exact centroid bytes and the checksum-bound `atlas.rapids-kmeans-receipt.v2` were passed to deterministic CPU SOM. The `atlas.som-receipt.v2` binds the input, initial-centroid, and KMeans-receipt checksums and reports 8×2 coordinates, a 4×2 codebook, and `canonical_authority=false`. This closes the bounded KMeans→SOM initialization experiment only. It does not prove an admitted policy/source cohort, production policy input, GA8 ablation, or canonical promotion.
- [x] SOM 20x20 coordinates remain derived/not canonical. **Verified 2026-09-27:** `SomTopologySnapshotV1` fixes the 20×20 grid and declares `canonicalAuthority: false`; the policy feature tensor has no SOM/topology/geometry fields. `policy-state.spec.ts` now guards against adding such names or passing `som_x`/`som_y` through the strict tensor schema. This proves the policy boundary only; it does not claim SOM training or canonical promotion.
- [x] No geometry-derived production feature before GA8-style ablation. **Verified 2026-09-27:** the fixed `POLICY_FEATURES` registry contains no SOM/topology/geometry feature and the strict state schema rejects coordinate fields. No geometry-derived input is admitted to policy decisions; GA8 ablation remains unperformed and is still required before any future geometry feature is proposed.

## PRT9 — E2E
- [ ] error/query -> OKF -> HMM -> PolicyStateTensor -> finite decision -> bounded tools
  - **Precheck 2026-09-28:** current `SearchRuntime` builds policy input through `buildPolicyStateFromRerankSignals()` and `routePolicy()`; the bridge derives a query state hint and does not supply an HMM posterior. The `model-analysis-sidecar` client has a `/hmm/viterbi` contract, but live `:8091` identifies as `langgraph-synthesis`; its OpenAPI has no `/hmm/viterbi` route and exposes `/hmm/adapt` plus `/hmm/stats`. Do not treat adaptation as inference. Component contracts remain proven (focused policy suites: 18/18), but this is not the requested OKF→HMM→bounded-tools end-to-end path. Task remains open pending a verified HMM owner/runtime and explicit integration; no model request or writes were made.
- [ ] canonical reducer -> rerank/ACE -> model if needed -> compile/test -> RouteTrace
- [x] same inputs/revisions produce same decision receipt under shuffled async completion. **Verified 2026-09-27:** `policy-decision-receipt-v1.ts` seals the state tensor, explicit policy/weights revision, decision, and sorted upstream input revision/checksum bindings; its schema recomputes both decision and receipt checksums. Duplicate input IDs, non-finite/mismatched state shape, and state-hint mismatch fail closed. Three focused tests prove completion-order invariance, revision sensitivity, and tamper rejection. This is a deterministic contract/fixture proof; it does not claim the full query-to-tool E2E path is live.

## STOP CONDITIONS
Stop on unresolved graph revision, duplicate runtime owner, ambiguous representation revision,
unproven labels, unbounded tool recursion, or a geometry/SOM feature being treated as canonical truth.
