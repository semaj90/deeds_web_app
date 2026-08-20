# Tasks — Parent Atlas Compute / Rank / Cache / Eval / DSPy-GEPA

## PA-COMPUTE-01 — content-addressed computation receipts

- [x] Add `atlas.computation-cache-descriptor.v1` key contract with stage, producer revision, dependency refs, parameters, revision set, and optional numerical-contract revision.
- [x] Permit cache reuse only for exact-key `PROVEN` receipts.
- [ ] Add artifact persistence adapter: immutable local/Arrow artifact + Valkey/BitFrost hot pointer.
- [ ] Add dependency-DAG invalidation test proving a source-only change does not invalidate unrelated graph/model artifacts.
- [ ] Emit stage receipts from daily Graphify without making cache state canonical truth.

## PA-FE-01 — finalize FeatureRowV1

- [x] Add `EvidenceLocatorV1`; keep `sourceRef`, `filePath`, `sourceUrl`, and domain classification orthogonal.
- [x] Add staged `FeatureRowV1` with revision lineage and scalar-to-Float32 projection.
- [x] Keep one `pagerankAuthority` feature and optional query-specific `pprAffinity`.
- [ ] Bridge the existing live candidate/retrieval row into this staged contract without deleting the existing `packet-feature-matrix.ts` owner.
- [ ] Prove canonical identity round-trip: candidate -> packetKey/canonicalId -> FeatureRowV1 -> exact evidence.

## PA-RANK-01 — PageRank authority -> FeatureRow

- [x] Reuse existing `pickPageRankAuthorityScore()` instead of creating a new authority resolver.
- [x] Require graph revision on FeatureRowV1.
- [ ] Join only promoted/revision-qualified PageRank data into the live candidate assembler.
- [ ] Re-run packet-facing/MCP PageRank distribution sanity: finite, variance > epsilon, distinct scores > 1, lineage present.
- [ ] Add ablation proving PageRank is useful and not duplicate-weighted against another authority alias.

## PA-RANK-02 — cross-encoder -> FeatureRow

- [x] Add deterministic pair-score cache key contract.
- [ ] Adapt existing `scripts/crossencoder-benchmark.py` to consume the final fused candidate set rather than only legacy XGBoost-v2 rows.
- [ ] Normalize/calibrate raw cross-encoder logits before assigning `FeatureRowV1.crossEncoder` (do not treat arbitrary logits as probabilities).
- [ ] Record model revision, tokenizer revision, max length, scoring/calibration revision, latency, and peak VRAM.
- [ ] Compare mxbai/bge candidates only under the same frozen eval corpus and candidate inputs.

## PA-CACHE-01 — cache cross-encoder pair scores

- [x] Key by query hash + candidate content hash + model/tokenizer/scoring revisions + max length.
- [x] Reuse only exact `proven` receipts.
- [ ] Add Valkey/BitFrost adapter with bounded TTL/residency metadata while retaining immutable receipt/artifact lineage.
- [ ] Add hit/miss/invalidated telemetry to daily receipts.

## PA-CACHE-02 — cache graph algorithm artifacts

- [ ] Materialize graph-projection artifact key from canonical graph revision + projection contract revision.
- [ ] Materialize PageRank/PPR/community outputs independently so changing a metric parameter invalidates only that metric.
- [ ] Persist ordinal map + algorithm revision + parameter revision + result hash.
- [ ] Prove NetworkX/Neo4j/cuGraph results may share one logical artifact only after parity gates pass; executor != lane vote.
- [ ] Add warm-load path for Arrow/mmap/VRAM projection without serializing full tensors through JSON.

## PA-EVAL-01 — frozen repair/localization eval corpus

- [x] Add `RepairEvalExampleV1` and receipt-derived `RepairEvalObservationV1`/score contract.
- [ ] Freeze train/validation/test IDs; never optimize GEPA on the held-out test split.
- [ ] Populate initial examples from verified historical repair receipts only.
- [ ] Record failure fingerprint, gold packet/source refs, validation commands, and acceptance criteria.
- [ ] Add retrieval Recall@5/10, MRR/NDCG, localization Recall@1/5, repair success, false-edit rate, latency, and cache-reuse measurements.
- [ ] Human-reviewed corrections may amend labels only as a new dataset revision; never silently edit an old frozen corpus.

## PA-DSPY-01 — RepairProgramV1 signatures/modules

- [x] Add import-safe Python bridge with DSPy `Signature`, `InputField`, `OutputField`, `Module`, and `Predict` construction.
- [x] Split diagnosis from proposal; supply exact `ContextManifest` and constraints explicitly.
- [ ] Add sidecar/RPC wrapper so TypeScript owns evidence acquisition while DSPy receives serialized promoted evidence.
- [ ] Prohibit DSPy program outputs from introducing evidence refs absent from the supplied manifest; validator must reject invented refs.
- [ ] Add deterministic structured-output parser/contract at the Parent Atlas boundary.

## PA-DSPY-02 — AtlasRepairMetricV1

- [x] Add normalized 0..1 receipt-derived metric + textual failure feedback.
- [ ] Bridge real test/typecheck/regression/evidence/localization receipts into the metric.
- [ ] Decide hard-fail policy: fabricated evidence, permission violations, regression, or unsafe mutation must score 0 regardless of soft features.
- [ ] Cache metric results by eval-example revision + program revision + model revision + receipt hash.

## PA-GEPA-01 — baseline -> optimized program comparison

- [x] Add current DSPy GEPA constructor shape with `metric`, `reflection_lm`, `auto='light'`, `log_dir`, `track_stats`, `track_best_outputs`, and fixed `seed`.
- [x] Add baseline/optimized mean comparison helper.
- [ ] Pin DSPy/GEPA versions in a WSL2 Python environment after a dedicated compatibility smoke test; do not add an unverified dependency to the main app environment.
- [ ] Run baseline program on frozen validation set and persist per-example receipts.
- [ ] Run GEPA with resumable `log_dir`; content-address the resulting program/instruction candidate.
- [ ] Promote only if validation improves and all hard gates remain non-regressed.
- [ ] Evaluate promoted candidate exactly once on held-out test set; that result cannot feed the same GEPA optimization run.

## PA-HITL-01 — human review / Kanban projection

- [x] Add `KanbanRecommendationProjectionV1` with evidence, acceptance criteria, validation commands, permission mode, Graphify/feature revisions, and human-decision state.
- [ ] Wire daily Graphify recommendations to proposed/review-required cards only; no auto-patching from unsupervised scores.
- [ ] Reuse existing `TaskPromotionGate` and recommendation policy instead of inventing a second task gate.
- [ ] Record `approve`, `reject`, or `request_changes` as append-only review events and feed verified outcomes back into eval/training datasets.
- [ ] Merge/supersede duplicate recommendations by canonical evidence identity and graph/workspace revision.

## PA-TRAIN-LATER — reranker/QLoRA follow-up (blocked)

- [ ] Mine hard negatives from high semantic/PageRank/PPR/community candidates that were not part of the verified repair.
- [ ] Fine-tune a cross-encoder only after frozen eval data and calibration are proven.
- [ ] Build `TrainingExampleV1` only from verified receipts + human-reviewed labels.
- [ ] Unsloth/QLoRA checkpointing, adapter evaluation, and promotion remain blocked until PA-EVAL-01, PA-DSPY-02, and PA-GEPA-01 pass.

## Validation commands for this branch

```bash
cd sveltekit-frontend
npx vitest run \
  src/lib/server/atlas/ranking/feature-row-v1.test.ts \
  src/lib/server/atlas/cache/cross-encoder-cache-key.test.ts \
  src/lib/server/atlas/evals/repair-eval-contract.test.ts \
  src/lib/server/atlas/cache/computation-cache-key.test.ts \
  src/lib/server/graph/nary-ranking-projection.test.ts \
  src/lib/server/atlas/evals/readiness-score.test.ts

cd ..
python -m pytest \
  python/tests/test_parent_atlas_pagerank_reference.py \
  python/tests/test_parent_atlas_dspy_repair.py -q
```

These commands are proposed validation commands; their success must be recorded from the actual Windows/WSL2 checkout before any task is upgraded to runtime-proven.
