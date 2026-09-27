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

## DSPy / GEPA / sub-prompt deep audit — 2026-08-31

The repository already has two separate surfaces and they must not be counted as one
live optimizer:

| Surface | Status | Evidence |
|---|---|---|
| TRACE sub-agent API/orchestrator | **WIRED** | `sveltekit-frontend/src/routes/api/trace/subagents/run/+server.ts`, `sveltekit-frontend/src/lib/server/agents/trace-subagent-orchestrator.ts` |
| DSPy repair signatures/module | **CREATED / BOUNDED** | `python/parent_atlas_dspy_repair.py`, import-safe when DSPy is absent |
| DSPy contract tests | **PROVEN_BOUNDED** | existing Python focused tests; does not prove a live DSPy runtime |
| GEPA constructor contract | **CREATED** | `build_gepa_optimizer_v1()`; no live optimizer execution |
| DSPy/GEPA runtime imports | **NOT_PROVEN / BLOCKED** | current audit records missing runtime dependencies |
| Typed evidence-ref anti-invention validation | **OPEN** | output validator and serialized sidecar boundary are not yet wired |
| Held-out split isolation | **OPEN** | train/validation/test IDs are not frozen in a receipt |
| OaK judge → repair suggestion | **PARTIAL** | judge feedback contract exists; automatic bounded producer is absent |
| Production self-modification | **FORBIDDEN** | no promotion or mutation path is authorized |

The executable audit is `scripts/atlas/audit-dspy-gepa-subprompts-v1.mjs` and its
read-only report is `docs/reports/dspy-gepa-subprompt-audit-v1.json`. It defines the
ordered follow-up gates `SUBPROMPT-REPLAY-01`, `DSPY-SIDECAR-01`, `GEPA-VERSION-01`,
`GEPA-768-INPUT-01` (added 2026-09-27 — proves the `semantic_768` retrieval trace → DSPy/GEPA
training-row conversion, gating the two entries below), `GEPA-HELDOUT-01`, `GEPA-SHADOW-01`,
`OAK-JUDGE-01`, and `PROMOTION-01`.

Do not mark the DSPy or GEPA tasks complete from the existence of signatures, a
constructor, or sub-agent routing. A live promotion requires serialized promoted
evidence, deterministic replay, frozen evaluation splits, hard-gate non-regression,
human review, and an immutable receipt. GEPA remains an offline/shadow worker and
must not write to PostgreSQL, Qdrant, Valkey, Neo4j, Graphify, or canonical identity.

### Ordered follow-up checklist

- [ ] SUBPROMPT-CENSUS-01 — classify existing prompt/sub-agent surfaces by orchestration, evidence acquisition, and model proposal.
- [ ] SUBPROMPT-CONTRACT-01 — add a serialized request/response boundary carrying ContextManifest checksum and allowed evidence IDs.
- [x] SUBPROMPT-REPLAY-01 — add read-only prompt replay mode comparing stable prompt-selection projections and checksums; live ACE-backed replay remains required for runtime proof.
- [ ] DSPY-SIDECAR-01 — connect the TypeScript evidence owner to an isolated DSPy worker; no store access from the worker.
- [ ] GEPA-VERSION-01 — prove pinned DSPy/GEPA imports in an isolated WSL2/container environment.
- [ ] GEPA-768-INPUT-01 — prove a revision-qualified `semantic_768` retrieval trace converts into
      this change's existing DSPy/GEPA training/eval schema without: (a) raw vector duplication —
      identity is frozen as `source_ref + source_revision + content_hash + representation_revision`,
      never a bare row count, so the same evidence item populated in both `content_embedding` and
      `content_embedding_768` (see `parent-atlas-semantic-768-canonical-contract`'s
      `SEMANTIC-768-OWNER-RECHECK-2026-09-27`) is never counted as two independent training
      examples; (b) missing `packetKey` — every row must round-trip candidate → `packetKey`/
      `canonicalId` → evidence, not synthesize one; (c) inferred revisions — no `unknown`/`latest`
      substitution for `sourceRevision`/`workspaceRevision`; (d) changing `semantic_768` ownership —
      this gate consumes the existing representation as a fixed feature source, it does not touch
      or resolve `AMBIGUOUS_SEMANTIC_768_OWNER`. A conforming row is shaped roughly as
      `{queryChecksum, sourceRevision, packetKey, semanticRepresentation: {kind: "semantic_768",
      representationRevision, modelRevision, vectorChecksum}, routing: {logicalLane, executor},
      outcome: {recallAt10, mrr, validationPassed, latencyMs}}` — never the raw 768-dim vector
      itself, only its checksum (GEPA optimizes routing/program behavior around the representation,
      it does not optimize the representation). This gate is data/schema work and can be attempted
      read-only, without a live DSPy/GEPA runtime — it does not depend on `DSPY-SIDECAR-01`/
      `GEPA-VERSION-01` passing first, but `GEPA-HELDOUT-01`/`GEPA-SHADOW-01` below depend on it.
- [ ] GEPA-HELDOUT-01 — freeze train/validation/test IDs and enforce held-out isolation.
- [ ] GEPA-SHADOW-01 — run a bounded validation-only GEPA experiment with fixed seed, resumable log, and candidate checksum.
- [ ] OAK-JUDGE-01 — map real bounded execution receipts to judge feedback and repair suggestions without auto-promotion.
- [ ] PROMOTION-01 — require human review, held-out non-regression, and an immutable promotion receipt before any candidate is promoted.

### JEPA / GEPA-768 INPUT LINEAGE AUDIT — 2026-09-27 (read-only)

- The saved Packet-JEPA training export contains 2,979 pair rows and 197 evaluation rows; every row in both files has `input_dim=64`. The exporter chooses `content_embedding_384`/`embedding` only when its parsed vector has at least 128 elements, otherwise it falls back to `latent_64`, then keeps the dominant dimension. `content_embedding_384` is the legacy 384-dim column dropped from `codebase_chunk_index` on 2026-08-30 (archived per CLAUDE.md's Embedding Dimensions Policy, zero data loss verified at drop time) — the exporter's column choice predates that drop and is not a currently reachable source. The canonical/derived lane set today is `semantic_768` (embeddinggemma, canonical primary) plus derived `MRL-512`, `MRL-256`, `MRL-128` truncations and the separately-trained `latent_256`/`latent_128`/`latent_64` autoencoder projections (see CLAUDE.md, same section, for population counts per lane). The observed export therefore trained on 64-D vectors via a since-retired column path, not semantic_768 or any of its current derived lanes.
- The saved training report labels its cosine baseline `embedding384_cosine` while reporting `input_dim=64` — the label refers to the exporter's now-dropped `content_embedding_384` fallback logic above, not a live 384-dim retrieval lane (384 remains retired repo-wide, per CLAUDE.md; do not reintroduce it). Treat its JEPA/PCA metrics as historical and dimension/source-ambiguous; they are not evidence for a 768-D (or 512/256/128-MRL, or latent-256/128/64) comparison. No JEPA training or artifact regeneration was run in this audit.
- The saved pair/eval rows carry packet keys and vectors, but lack the `source_ref + source_revision + content_hash + representation_revision` identity tuple and immutable model/representation checksums required by `GEPA-768-INPUT-01`. The current Python bridge exposes `RepairMetricObservationV1` for scoring, but no typed semantic-retrieval-trace adapter was found.
- Code-only progress: `build_semantic_768_gepa_example_v1()` in `python/parent_atlas_dspy_repair.py` validates the stated metadata-only example shape, rejects missing/placeholder revisions, non-768 representations, lane/executor conflation, and unknown/raw-vector fields, and emits a deterministic checksum over the source/revision/content/representation identity tuple. Focused tests cover admission and fail-closed cases; this is not a live trace or canonical admission proof.
- Result: `GEPA-768-INPUT-01` remains OPEN. A real admitted trace, explicit duplicate-row handling in the future loader, and semantic-768 ownership reconciliation remain required before marking the gate complete. `DSPY-SIDECAR-01`, `GEPA-VERSION-01`, and held-out/shadow gates remain separate.
- No database, Qdrant, Valkey, model, or training-artifact writes were performed. The existing export files were read only.
