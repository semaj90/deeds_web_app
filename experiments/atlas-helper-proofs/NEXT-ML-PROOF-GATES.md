# Parent Atlas CPU ML next gates — source-owner implementation TODO

This is a **source census and worklist**, not deployed proof. Reuse owners, do not clone indexing, graph, classifier or checkpoint authority. Existing experimental scripts live beside this file.

## P0 — KMeans centroid and assignment readback
- Existing: `scripts/atlas/train-turbovec-kmeans.mjs`, `scripts/atlas/kmeans-multi-k-experiment.mjs`, `sveltekit-frontend/src/lib/server/retrieval/phase2-kmeans-clustering.ts`, `workers/atlas-cluster-worker.py`, `python-workers/worker_kmeans.py`.
- Experiment: `cpu_torch_alignment.py::kmeans_cpu`.
- [ ] REVIEW owner of centroid IDs and `representationRevision`; capture frozen feature-matrix rows and mask.
- [ ] IMPLEMENT final **post-update** nearest-center assignment, empty-cluster handling, repeat-point degeneracy and stable tie-breaking.
- [ ] TEST centroid checksum readback and final labels/inertia (rerun nearest centroid without fitting); reject NaNs, duplicate IDs and revision mismatches.
- [ ] PROVE against authoritative CPU owner before cuVS GPU comparison. Clustering labels never become packet identity.

## P0 — Python / TypeScript [C,25] float32 parity
- Existing owner: `sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts`; wrapper `candidate-feature-matrix-adapter-v1.ts` and `candidate-feature-matrix-adapter-v1.spec.ts`.
- Experiment: `cpu_candidate_matrix.py`, `cpu_parity_cli.py`, `c25-parity-existing-owner.mts`, `c25-parity-fixture.json`.
- [ ] IMPLEMENT runner that calls both language executors in an isolated checkout, compares raw little-endian 32-bit floats and presence mask bytes, counts, packet row identities and ordering; do not compare only displayed JSON decimals.
- [ ] TEST negative zero, rounding, NaN/Infinity, overflow, unknown feature, missing vs measured zero, multiple row ordinals and source revision mismatch.
- [ ] PROVE same featureRevision + executorProvenance and matrix checksum before ContextManifest consumption; do not treat the independent experimental checksum as canonical.

## P0 — Frozen labeled datasets and leakage checks
- Existing candidates: `sveltekit-frontend/scripts/atlas/train-query-router-pytorch.py`, `sveltekit-frontend/scripts/atlas/phase3-logistic-regression-classifier.mts`, `scripts/atlas/train-policy-reranker.py`, `sveltekit-frontend/scripts/atlas/train-naive-bayes-packet-features.mjs`.
- Experiment: `cpu_train_eval.py::group_split`, `impute_train_only`.
- [ ] REVIEW true label owner and query-group identity, timestamp, revisions and actual dataset access; never synthesize ground-truth labels.
- [ ] IMPLEMENT snapshot manifest: dataset SHA256, label/taxonomy/schema revisions, split groups, seed, feature registry checksum, class balance and provenance refs.
- [ ] TEST no train/validation/test group overlap, no future data leakage, train-only transform fit, stable splits under row reorder, deterministic frozen readback.

## P1 — Calibrated UNKNOWN abstention
- Existing: `packages/parent-atlas/src/core/domain-classification-v1.ts`, `domain-classification-v1.spec.ts`; `openspec/changes/parent-atlas-query-routing-classifier/tasks.md`; `docs/PHASE-2-DOMAIN-CLASSIFIER-CORRECTIONS.md`.
- Experiment: `ontology_unknown_router.py`, `cpu_nlp_lut.py`, `cpu_train_eval.py::classification_report`.
- [ ] REVIEW canonical taxonomy and OaK tuple resolver; unknown vocabulary is not permission to invent a class or ontology ID.
- [ ] IMPLEMENT threshold selection on held-out calibration groups only; retain class logits, top-2 margin, calibrated confidence, UNKNOWN reason and revision.
- [ ] TEST OOD vocabulary, ambiguous tuple, stale ontology revision, low-margin, all-zero features, class imbalance and calibration drift. Report macro-F1, coverage, risk at coverage and false accept rate.

## P1 — Reproducible model artifacts / optimizer receipts
- Existing: `scripts/atlas/record-lora-checkpoint.mjs`, `python/atlas_gemma_rank_checkpoint_inventory_v1.py`, `python/atlas_gemma_rank_tensor_alignment_proof_v1.py`, `scripts/atlas/train-policy-reranker.py`.
- [ ] REVIEW checkpoint and model revision owner before creating new registry or DB table.
- [ ] IMPLEMENT CPU-only safetensors export/readback of *model state_dict* plus JSON sidecar manifest containing model architecture, feature registry, dataset/split digest, code/Torch versions, seed and hyperparameters.
- [ ] IMPLEMENT optional resumable optimizer state with an explicit versioned/trusted local checkpoint policy: safetensors tensor-only model weights do not automatically preserve AdamW step/moment state, RNG, dataloader cursors or scheduler.
- [ ] TEST byte digest readback, key/shape/dtype equality, eval logits parity after reloading, tampering, missing manifest, model-to-feature registry mismatch and safe path bounds.
- [ ] Gate QLoRA/SLM/cuvs/GPU behind independently verified CPU baseline and declared device owner.

## Cross-cutting TODO
- [ ] Run local full `python -m unittest discover -p 'test_*.py' -v` with parser, NetworkX and torch optional dependencies available.
- [ ] Run real Python/TypeScript/Svelte AST extraction; unresolved span boundaries remain diagnostic.
- [ ] Confirm Graphify PageRank/CheiRank directed-edge reversal, source/graph revision and node-to-packet row mapping.
- [ ] Bind qualified outputs to admitted evidence and existing ContextManifest/DAG owner; proposal-only until then.

Do not claim a passing test, production wiring or migrated store from this checklist.

## P0 — Frozen semantic_768 → KMeans partition hint → exact oracle → graph expansion → learned rank
- [x] SOURCE drafted: `semantic_partition_oracle.py` compares full exact squared-L2 ranking to centroid-restricted ranking and explicit typed-edge expansion.
- [x] SOURCE drafted: `immutable_attempt_receipt.py` writes attempt-terminal receipts with exclusive-create semantics; HMM predictions remain advisory.
- [x] TEST drafted: `test_partition_and_receipts.py` covers lost neighbors, graph expansion, forged edges, supersession and tamper readback.
- [ ] TEST local unit suite in actual checkout, then record command, versions, outputs and immutable receipt.
- [ ] REVIEW production exact oracle metric (L2 vs cosine/dot), normalization, float dtype, deterministic tie order and frozen embedding revision; CPU L2 cannot be claimed to prove cuVS exact parity.
- [ ] TEST Recall@K for probe counts 1..N and full partition; record candidate counts, latency, recall and worst-case missed packet IDs.
- [ ] REVIEW real graph edge source and graph revision before expansion; current experimental edges are supplied fixture tuples, not qualified Graphify provenance.
- [ ] IMPLEMENT existing [C,25] candidate feature adapter mapping for centroid similarity/rank, PageRank/graph distance/n-ary overlap and exact lexicalness only after their individual provenance/normalization gates.
- [ ] REVIEW receipt terminal outcomes and supersession owner: preserve old receipts append-only; no rewrites, no HMM authorization; bind retry/new attempt to a distinct ID.
- [ ] PROVE deployment parity with existing Qdrant and cuVS exact executor; only then evaluate bounded candidate restrictions in proposal mode.

To test:
```sh
cd experiments/atlas-helper-proofs
python -m unittest -v test_partition_and_receipts.py
```
