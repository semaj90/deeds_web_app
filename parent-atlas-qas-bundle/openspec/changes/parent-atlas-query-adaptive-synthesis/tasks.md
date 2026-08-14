# Tasks

## QAS-00 Ownership audit
- [ ] Locate the live `graphify:daily` script owner from `sveltekit-frontend/package.json`.
- [ ] Locate existing SOM 20x20 owner; do not create a second SOM implementation.
- [ ] Locate existing ContextManifest / retrieval receipt owner.
- [ ] Locate existing recommendation / Kanban materializer owner.
- [ ] Locate existing GPU bridge and confirm whether softmax/top-K/batch-cosine/SOM/PCA are callable from the live runtime.
- [ ] Locate existing ACE/BitFrost residency interface.
- [ ] Emit `docs/reports/qas-owner-audit.{json,md}`.

## QAS-01 Contracts
- [ ] Add `QueryIntentEnvelopeV1`.
- [ ] Add `QasCandidateFeatureV1`.
- [ ] Add `QasSamplingReceiptV1`.
- [ ] Add `QasPlanCandidateV1`.
- [ ] Add explicit `EXACT_PROMOTED | APPROXIMATE_ONLY | REJECTED` evidence state.

## QAS-02 Software-head compiler
- [ ] Reuse semantic/structural/lexical/execution/memory/program facts already produced by Parent Atlas.
- [ ] Missing features remain optional/unknown; do not coerce them to zero unless the producer contract says zero is meaningful.
- [ ] Record producer revision/evidence refs for every realized feature family.

## QAS-03 Query-conditioned sampler
- [ ] Implement deterministic weighted sampling with seeded PRNG.
- [ ] Support budgets 128/512/2048.
- [ ] Support exact top-K baseline.
- [ ] Compute overlap@K and recall@K.
- [ ] Hard gate promotion on exact canonical lookup.

## QAS-04 SOM binding
- [ ] Read existing SOM assignment/centroid artifacts.
- [ ] Query -> winner/neighborhood only; SOM never becomes answer truth.
- [ ] Record SOM revision/run ID where available.
- [ ] If SOM lineage is unavailable, run in `DOMAIN_ONLY_DEGRADED` mode.

## QAS-05 Context synthesis
- [ ] Extend existing ContextManifest instead of creating a second request manifest.
- [ ] Add selection reason, approximate score, exact evidence refs, feature revision, and policy revision.
- [ ] Bound by token/candidate/GPU budgets.

## QAS-06 AI-assisted DAG
- [ ] Generate bounded plan candidates only after exact promotion.
- [ ] Score correctness evidence, testability, minimality, risk, and cost.
- [ ] Persist selected plan + alternatives as receipts.
- [ ] No policy-gradient training in request path.

## QAS-07 Daily Graphify shadow wiring
- [ ] Append QAS shadow stage after successful structural refresh.
- [ ] Add `--skip-qas` escape hatch if the existing runner supports flags; otherwise add a separate post-stage command.
- [ ] QAS failure is visible in report/exit metadata but does not mutate Graphify data.
- [ ] Daily report includes Graphify revision -> QAS policy/feature revision linkage.

## QAS-08 Recommendation/Kanban
- [ ] Convert only durable evidence-bearing receipts into recommendations.
- [ ] Suggested file targets must include relation/reason.
- [ ] Never auto-approve a code mutation from an approximate-only candidate.

## QAS-09 ACE/BitFrost
- [ ] Emit residency hints only after exact promotion.
- [ ] Record predicted reuse, memory cost, promotion cost, TTL/priority suggestion.
- [ ] No direct cache mutation until a separate ACE integration gate passes.

## QAS-10 Adapter selection
- [ ] Stage 1: no-adapter baseline vs exactly one adapter.
- [ ] Stage 2+: multi-adapter routing only after Stage 1 evaluation.
- [ ] Weighted composition/rank recompression remain NOT_AUTHORIZED until separate proof.

## QAS-11 Offline learning
- [ ] Export GEPA/DSPy optimization examples from receipts.
- [ ] Export GRPO/PPO-compatible grouped trajectories only as datasets.
- [ ] Offline optimizer output must pass shadow eval before becoming a new policy/program revision.

## Acceptance
- deterministic test fixtures,
- no canonical writes from approximate-only paths,
- exact baseline present,
- seeded sampler reproducible,
- Graphify truth unchanged,
- `git diff --check`,
- targeted unit tests pass,
- report produced under `docs/reports/`.
