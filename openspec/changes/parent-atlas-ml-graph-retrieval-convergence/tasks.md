# Parent Atlas ML / graph retrieval convergence — implementation tasks
Date: 2026-10-07
Status: source-index audit only; no runtime or datastore proof from this change.
Branch: codex/parent-atlas-ml-graph-gap-audit-20261007

## Owner reconciliation (source evidence)
- [x] AUDIT-01 Locate current repository owners: `sveltekit-frontend/src/lib/server/retrieval/canonical-rerank-executor.ts`, `python/atlas_compute/neural_router.py`, `python/atlas_graph_runtime/networkx_executor.py`.
- [x] AUDIT-02 Find existing SVD work: `python/pca_svd_representation_baseline_v1.py`, `python/freeze_pca_svd_basis_v1.py`, `python/atlas_compute/representation_compare.py`, `openspec/changes/parent-atlas-pca-svd-representation-baseline/tasks.md`. Do not copy scaffold's SVD implementation over these.
- [x] AUDIT-03 Identify existing graph execution and PageRank parity: `python/atlas_compute/typed_graph_runtime.py`, `python/parent_atlas_networkx_pagerank.py`, `scripts/gpu/networkx-backend-smoke.py`; preserve the NetworkX oracle.
- [x] AUDIT-04 Locate ranking prior art: `scripts/atlas/train-policy-reranker.py` (ListMLE), `python/atlas_xgboost_grouped_ranking_v1.py`, `sveltekit-frontend/src/lib/server/retrieval/ranking-features.ts`, `scripts/atlas/build-atlas-reranker-input-from-ranking.mjs`.
- [x] AUDIT-05 SearchRuntime RF6 already has logical semantic-vote implementation and historic tests in `openspec/changes/parent-atlas-retrieval-fusion-reachability/tasks.md`; **do not reimplement**. Remaining legacy-route delegation/TurboVec ordinal bridge must retain their existing owners.
- [x] AUDIT-06 Find existing `graphsage128` feature declaration in `sveltekit-frontend/src/lib/server/retrieval/feature-record.ts`, which is **not** proof of a trained GNN or producer.
- [x] AUDIT-07 Find quaternion-manifold and UMAP references; they are not grounds for creating canonical embedding replacements.

## Gate A — real ranking data, before new model code
- [ ] ML-DATA-01 Trace the actual feature/label producer from `ranking-features.ts`, existing policy reranker and XGBoost grouped ranking inputs. Record schema, label origin, query group identity, snapshot/checksum, and train-only statistics. No labels inferred from production RRF scores as independent ground truth.
- [ ] ML-DATA-02 Join each row to current `atlas_packet_chunk_lineage` and canonical packet/representation revisions. Exclude unresolved or stale rows; emit rejection reasons, never silently backfill.
- [ ] ML-DATA-03 Freeze read-only query-group train/validation/test partitions; ensure no query groups or near-duplicate revision identities leak across splits.
- [ ] ML-DATA-04 Record a compact `RankingDatasetManifestV1`: immutable dataset digest, source revisions, feature schema, splits, provenance, exclusion counts, artifact path.
- [ ] ML-DATA-05 Create a tiny *fixture-only* JSONL dataset and negative controls: stale revision, alias duplicate, missing label, disconnected graph fact, rank tie. Never label fixture scores as production performance.

## Gate B — CPU model baseline: reuse code before adding new code
- [ ] ML-CPU-01 Decide whether to extend `scripts/atlas/train-policy-reranker.py` or the existing grouped XGBoost owner for a six-to-twelve-feature MLP challenger; prohibit another independent ranking-policy authority.
- [ ] ML-CPU-02 Add optional CPU AdamW MLP with deterministic seeds, train-only normalization, gradient clipping, early stopping, per-query group sampling, and checksum/versioned checkpoint receipts. No automatic model promotion.
- [ ] ML-CPU-03 Compare RRF, XGBoost, existing ListMLE policy reranker, and MLP on **the same frozen dataset** with MRR@10, nDCG@10, Recall@K, exact-symbol hits, revision rejects, p50/p95 latency and memory.
- [ ] ML-CPU-04 Gate acceptance on improvements without provenance regressions, calibrated labels, repeatability, and a CPU-only rollback; otherwise keep MLP as challenger.
- [ ] ML-CPU-05 Prove the inference adapter cannot rank an unqualified/stale candidate into the final ContextManifest.

## Gate C — bounded graph candidate features / GNN
- [ ] GNN-01 Inventory executable graph feature producers versus registry-only declarations (`graphsage128`, PageRank, neighborhood stats, typed edges, N-ary facts).
- [ ] GNN-02 Reuse `atlas_graph_runtime/networkx_executor.py` and typed graph execution receipts to export frozen, revision-qualified 1–2 hop neighborhoods. Distinguish AST/code edges, hypergraph incidence, and ANN/HNSW adjacency.
- [ ] GNN-03 Add CPU mean-neighbor aggregation oracle only if equivalent owner is absent. Validate directed edge semantics, isolated nodes, duplicate edge treatment, node ordinals and deterministic ordering.
- [ ] GNN-04 Prototype GraphSAGE-style challenger on small sampled subgraphs with query-group splits; compare to feature MLP. Do not materialize `graphsage128` into canonical retrieval absent proof.
- [ ] GNN-05 Record graph revision, input graph checksum, edge-evidence checksums, sampler seed, neighborhood budget, train split, model checksum and per-query readback in experiment receipts.

## Gate D — projection, GPU and C++ acceleration
- [ ] PROJ-01 Reuse frozen SVD 64/128/256 basis and existing `representation_compare` harness. Recheck provenance/dataset parity, exact 768-d oracle overlap, checksum and reload determinism. No replacement of semantic_768.
- [ ] PROJ-02 Audit existing K-Means/UMAP/t-SNE owners. Allow offline diagnostic clustering/visualization only until measurable candidate recall/latency gains are proved; do not index 2-d UMAP or t-SNE as canonical embeddings.
- [ ] PROJ-03 Keep quaternion/S³ rotation as an opt-in experimental transform with metric equivalence checks, preservation tests, and explicit distinction between q and -q orientation equivalence vs signed embeddings.
- [ ] GPU-01 Benchmark available GPU VRAM **after** checking current model occupancy; don't evict inference/services. Compare CPU vs CUDA per feature batch with latency, conversion, allocation, correctness and failure receipts.
- [ ] GPU-02 Reuse `nx-cugraph`/cuGraph executor seams. Prove BFS, SSSP, PageRank/PPR parity against NetworkX and prevent simulated GPU verdicts from counting as live proof.
- [ ] CPP-01 Profile Python->graph conversion and adjacency traversal before proposing Boost C++/N-API. Add a Boost CSR challenger only with repeatable speedup and parity evidence.

## Gate E — synthesis evidence
- [ ] SYN-01 Produce one read-only request-to-context replay: query → lexical/semantic/AST/graph/hypergraph candidates → SearchRuntime RRF → bounded graph expansion → existing reranker or shadow MLP → ContextManifest → PromptPlan. Include rejected candidates and execution receipts.
- [ ] SYN-02 Preserve one semantic logical lane, canonical IDs, source/workspace/graph/representation revisions and every executor ID as evidence metadata; no invented graph facts or additional RRF votes.
- [ ] SYN-03 Feed results into existing OpenSpec `evidence_receipts`, `task_evidence`, and `evidence_assertion` owners, not an invented second receipt database.
- [ ] SYN-04 Keep all models/readbacks proposal-only until human-approved promotion with model and feature revision pins and rollback.

## Safe initial read-only probes
```bash
rg -n 'train-policy-reranker|atlas_xgboost_grouped_ranking|RankingDataset|ListMLE|ranking-features' python scripts sveltekit-frontend/src/lib/server
rg -n 'graphsage128|networkx_executor|TypedGraphEdge|NaryFactV1|HyperEdgeEvidenceV1' python scripts sveltekit-frontend/src/lib/server
rg -n 'SearchRuntime|RF6_SEMANTIC|semantic.*vote|candidateOrdinal' sveltekit-frontend/src/lib/server openspec/changes/parent-atlas-retrieval-fusion-reachability
```

## Non-goals
- No new canonical packet format, table, Qdrant collection, Redis/BitFrost source of truth, or RRF owner.
- No automatic QLoRA/YaRN adoption, graph rewrites, GPU resource eviction, new Windows/WSL environments or package installs.
- No claims of live execution from source-trace findings alone.

## Handoff
likely_cause: Standalone CPU scaffold overlaps several mature repository owners; actual gap is lineage-qualified ranking data, challenger evaluation and replay wiring.
evidence: GitHub source search and selective owner-file reads on 2026-10-07.
patch_targets: Existing ranking-dataset/feature owner (TBD by Gate A), existing policy reranker (TBD by Gate B); this task file only for now.
safe_next_command: `rg -n 'train-policy-reranker|atlas_xgboost_grouped_ranking|ranking-features' python scripts sveltekit-frontend/src/lib/server`
smoke_command: `python -m compileall -q python/atlas_compute python/atlas_graph_runtime`
report_path: `docs/reports/parent-atlas-ml-graph-convergence-20261007.md` (pending)

## Addendum 2026-10-07 — GraphSAGE, XGBoost CUDA, NB/LR alignment
Source trace, **not** an execution proof. The original GraphSAGE method is Hamilton, Ying & Leskovec (NeurIPS 2017), *Inductive Representation Learning on Large Graphs*: neighborhood sampling + aggregation learns a function for unseen nodes; `graphsage128` in feature-record.ts is only a declared 128-d representation family.

- [x] ALG-01 Source-locate `graphsage128`: `sveltekit-frontend/src/lib/server/retrieval/feature-record.ts` and `sveltekit-frontend/drizzle/manual/feature_records_and_recommendation_events.sql`. No GraphSAGE training/producer is established by those declarations.
- [x] ALG-02 Source-locate Naive Bayes and Logistic Regression: `python/train_domain_classifier.py` explicitly fits KMeans cluster features -> MultinomialNB + LogisticRegression with weak domain labels. `scripts/ml/ml_sidecar/server.py` is a separate legacy/demonstration candidate with dummy-model fallback; do not elevate it into a canonical owner.
- [x] ALG-03 Source-locate historical XGBoost CUDA gate: `openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/tasks.md`, `python/atlas_xgboost_grouped_ranking_v1.py`, `scripts/atlas/train-xgboost-reranker.py`. The gate recounts both successful historical CUDA work and a later regression/recovery; neither establishes **current** GPU runtime execution.
- [ ] ALG-04 Audit `python/prove_atlas_xgboost_gpu_runtime_v1.py`, trainer CLI `--device`, grouped `qid` handling and CUDA booster configuration at current HEAD. Run synthetic read-only CPU control + `cuda:0` probe only if GPU is idle. Require device proof from booster configuration/telemetry, no silent CPU fallback, output receipt with package version, compute cap, dataset size, VRAM peak and checksum.
- [ ] ALG-05 Use multinomial/bernoulli NB or logistic regression **only as measured CPU baselines** for domain/intent routing or binary candidate relevance; weak labels must be tagged as weak, never used as independently verified relevance truth. Compare macro-F1/calibration for routing and query-group MRR/nDCG for ranking.
- [ ] ALG-06 Define feature alignment in a frozen `CandidateFeatureSchemaV1`: exact-symbol, FTS score, semantic similarity, PageRank, graph distance, hyperedge overlap, source authority, domain confidence, revision-validity mask. Fit scaler only on training groups; consistent feature order, missing masks, checksum and transformation parity across NB/LR/XGB/MLP.
- [ ] ALG-07 Keep eligibility upstream of ML: a model score cannot override stale-source, unauthorized candidate, graph revision mismatch, or ungrounded N-ary incidence.
- [ ] ALG-08 If GraphSAGE is built, prefer a CPU GraphSAGE 1-hop/2-hop sampled mean aggregator, distinct typed relation treatment, frozen ordinal map and graph revision; compare against simpler neighbor-statistics + XGBoost/MLP. No automatic 128-d embedding writer.

## Scaffold implementation status — 2026-10-07 (PR #110)
- [x] SCAF-01 Added `python/atlas_compute/ranking_alignment_v1.py`: ordered feature schema, strict nonempty revision tuple, PROVEN gate, finite labeled data, per-query dedup, digest and deterministic query-group split. **Adapter only**: does not prove rows against the live lineage table.
- [x] SCAF-02 Added `python/atlas_compute/ranking_baselines_v1.py`: CPU logistic binary classification and AdamW regression-score MLP, with train-only normalization; shadow-only.
- [x] SCAF-03 Added `python/tests/test_ranking_alignment_v1.py`: four focused stdlib unit tests **authored, not run in this GitHub-only session**.
- [ ] SCAF-04 Run tests in existing Python environment: `PYTHONPATH=python python -m unittest discover -s python/tests -p test_ranking_alignment_v1.py -v`; Python import/compile and complete model smoke remain unverified.
- [ ] SCAF-05 Provide authoritative lineage join and real label provenance before a training dataset is admitted; a row-provided `revision_status=PROVEN` is NOT independent proof.
- [ ] SCAF-06 Tie the new 8-feature adapter to the actual existing `ranking-features.ts` / XGBoost/ListMLE feature shape and model inputs via explicit versioned conversion, rather than silently exchanging incompatible schemas.
- [ ] SCAF-07 Extend the baseline with query-wise ranking loss (e.g. ListMLE), early stopping, evaluation, artifact hashes and checkpoint readback; current MLP uses MSE and is only a smoke challenger, not a complete ranker.
- [ ] SCAF-08 Implement tests for cross-revision candidate aliases, missing features, nonfinite labels and split leakage at document revisions across queries.

## V2 feature / RTX parity addendum
- [x] ALIGN-01 Added `python/atlas_compute/ranking_feature_layout_v2.py` with 8x float32 features, 8x uint8 missing mask, and optional 16x float32 scoring layout. Keeps semantic_768 independent from ranking features. `axv2` search returned no indexed matches; do **not** equate this provisional schema with an existing "AXV2" owner.
- [x] ALIGN-02 Added `python/prove_ranking_cpu_gpu_alignment_v2.py`: bounded synthetic CPU probe, optional explicit cuda:0 float32 copy/readback, fail-closed CUDA availability/VRAM budget, machine-readable receipt, no datastore writes.
- [x] ALIGN-03 Added `python/tests/test_ranking_feature_layout_v2.py` with mask-offset and semantic-dimension failure checks (authored, **not run** on GitHub checkout).
- [ ] ALIGN-04 Execute CPU fixture tests and `PYTHONPATH=python python python/prove_ranking_cpu_gpu_alignment_v2.py --device cpu`; record output.
- [ ] ALIGN-05 On idle RTX 3060 Ti, run `PYTHONPATH=python python python/prove_ranking_cpu_gpu_alignment_v2.py --device cuda --max-gpu-mb 64 --output docs/reports/ranking-cpu-gpu-parity-v2.json`. CUDA execution must be observed; do not use torch.cuda.is_available() alone as proof.
- [ ] ALIGN-06 Add **separate** cuVS brute-force oracle test on frozen 768d vectors with index/distance TopK parity vs deterministic NumPy exact reference. Check distance metric, normalization, tied ranks, stable canonical ordinal map, k bounds, CUDA package availability, device synchronization and GPU memory budget. cuVS similarity results are not the 16-column ranking feature tensor.
- [ ] ALIGN-07 Add cuVS CAGRA challenger and Qdrant HNSW Recall@K vs the same exact brute-force oracle, seed and representation revision. Keep only one semantic logical lane regardless of executor count.
- [ ] ALIGN-08 Add CPU/GPU ranker parity for a frozen fitted model, not just tensor-copy equality; compare float tolerance, ordering/ties, missing masks, dataset/model checksum, p50/p95 latency, VRAM peak and result receipt.
- [ ] ALIGN-09 Verify actual `axv2` name/contract from local working tree or artifacts before integration; no indexed GitHub source matched the term.
- [ ] ALIGN-10 Avoid empty_cache as a service-wide eviction mechanism; constrain the probe to its own tensors and verify available memory before allocating. Inspect scope and side effects before running.

## Graph tensor / ATen / Boost / rendering separation
- [x] TENSOR-01 Source-located `sveltekit-frontend/src/native/libtorch_inference.cc`, `native/atlas_core/src/atlas_similarity_graph_libtorch.cpp` and `sveltekit-frontend/src/lib/server/atlas/tensors/metrics-registry.ts`. These establish prior-art seams, not proof of currently executed ATen CUDA ranking.
- [x] TENSOR-02 Added `python/atlas_compute/graph_tensor_metrics_v1.py` with CPU reference, optional CUDA scatter aggregation, tolerance-based numerical comparison, deterministic Top-K tie breaking for score comparison and checksum receipt; `python/tests/test_graph_tensor_metrics_v1.py` authored. Neither was executed through this GitHub connector.
- [ ] TENSOR-03 Prove directed-edge semantics, zero-degree node behavior, self loops, duplicates, typed-edge filters, frozen ordinal map and feature/graph revision readback against the existing NetworkX oracle. Current torch probe is not an authoritative graph implementation.
- [ ] TENSOR-04 Record CUDA scatter nondeterminism: PyTorch index_add_ on CUDA may be nondeterministic. Add repeatability distribution, max/mean error, edge-order perturbation and deterministic-mode failure receipts; avoid claiming exact byte parity from a successful tolerance check.
- [ ] TENSOR-05 Benchmark CPU NetworkX -> torch CPU -> torch CUDA, optionally cuGraph, with transfer/conversion costs and peak memory. Reuse existing `metrics-registry.ts` schema or adapt it; avoid parallel metric ownership.
- [ ] ATEN-01 Inspect C++ LibTorch owners and ABI/build settings before binding new `torch::Tensor` functions; prototype a no-copy read-only CSR/tensor descriptor only after ownership and lifetime contracts are confirmed. No OS pointer across RPC/QUIC boundaries.
- [ ] BOOST-01 Profile existing C++ graph and Python data-conversion path; if material, prototype Boost.Graph CSR BFS/SSSP challenger and validate node/edge/revision parity, CPU memory and latency against NetworkX. No duplicate graph registry.
- [ ] RENDER-01 Source search did not show an `AnimationMixer` implementation. Audit actual WebGPU/three.js demo ownership before adding physics. Rendering physics state and animations are *visualization consumers*, never ranking or packet-revision authorities.
- [ ] RENDER-02 If requested, implement a separately budgeted graph visualization animation with deterministic interpolation, fixed timestep, decoupled camera/layout physics and immutable evidence snapshots. Never mutate Graphify edges from visualization simulation.

## AVX2 / SIMD JSON / N-ary tile and cache (2026-10-07)
- [x] TILE-01 Documented dedicated `4x6` candidate feature tile, tuple identity and separate model KV in `avx2-nary-tile-cache-design.md`.
- [x] TILE-02 Added CPU-only `python/atlas_compute/candidate_concept_tile_v1.py` and fixture tests; strict four-row layout, mask/padding, immutable digest, N-ary role/revision checks. Source flags are fixture assumptions, not actual lineage join verification.
- [ ] TILE-03 Execute `PYTHONPATH=python python -m unittest discover -s python/tests -p test_candidate_concept_tile_v1.py -v`; record runtime receipt. No test was executed by GitHub connector.
- [ ] TILE-04 Locate SIMD JSON bridge runtime dispatch, add scalar vs AVX2 equivalence on schema-qualified JSONL tuples and UTF-8 malformed inputs.
- [ ] TILE-05 Bind real domain taxonomy revision, NaryFact/HyperEdge evidence and lineage table to tile admission; reject stale revisions based on canonical lookup rather than row flags.
- [ ] TILE-06 Compare scalar vs AVX2 tile scoring with explicit 8-lane packing/padding masks, CPUID dispatch, benchmark including conversion overhead.
- [ ] TILE-07 Bind TurboVec cuVS/Qdrant ordinal candidates to separately indexed semantic_768 vectors; no 4x6 tile ANN index and no extra semantic RRF vote.
- [ ] TILE-08 Reuse existing ACE/BitFrost descriptor/lease/gen cache authorities, materialize tile only under revision+feature+content digest, state-machine transition receipts and invalidation tests.
- [ ] TILE-09 Bind final admitted evidence to ContextManifest/prompt prefix checksum. llama-server owns KV; no writing tile bytes into model KV.
- [ ] TILE-10 Run RTX 3060 Ti optional 4x6 scoring transfer vs CPU, accounting for allocation/padding and comparing end-to-end latency; CPU SIMD may be faster for a tiny tile.
