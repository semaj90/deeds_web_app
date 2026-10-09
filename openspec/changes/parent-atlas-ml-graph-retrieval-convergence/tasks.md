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

## Evidence and cache bridge increment (2026-10-07)
- [x] BRIDGE-01 Add `python/atlas_compute/concept_tile_bridge_v1.py` pure adapter: N-ary roles, member candidate participation, graph revision, evidence refs, duplicate fact checks, no fabricated overlap score. Supplied checksums **not cryptographically verified against authoritative source**.
- [x] BRIDGE-02 Add `python/atlas_compute/concept_tile_residency_v1.py`: complete revision- and artifact-qualified cache descriptor fingerprint; legal transitions and invalidation on descriptor mismatch. No existing cache owner is replaced.
- [x] BRIDGE-03 Add `python/tests/test_concept_tile_bridge_v1.py`: four source fixtures for deterministic projection, participant membership, cache invalidation, transition guards. Tests not executed through GitHub connector.
- [ ] BRIDGE-04 Run `PYTHONPATH=python python -m unittest discover -s python/tests -p 'test_*concept_tile*' -v` in established sidecar environment. Record import/test results, no new environment.
- [ ] BRIDGE-05 Adapt real HyperGraphRAG NaryFactV1 API payload into bridge and prove source/fact checksums, evidence roles, version pins by independent read-only lookup. Reject caller-supplied PROVEN as proof.
- [ ] BRIDGE-06 Integrate canonical domain classification confidence and concept denominator; derive overlap only with query grounded concept IDs and exact incidence evidence.
- [ ] BRIDGE-07 Wire existing simdjson bridge with full schema walk/validation of consumed JSONL. simdjson On Demand does not validate unused fields automatically.
- [ ] BRIDGE-08 Delegate descriptor/lease/cache generation transitions to existing ACE/BitFrost policy owner with readback, concurrency and tombstone tests. Do not independently write new store keys.
- [ ] BRIDGE-09 Bind ContextManifest and llama-server prompt-prefix identity at model/template/tokenizer/adapter/evidence revisions; prohibit raw tile insertion into KV.
- [ ] BRIDGE-10 Implement scalar/AVX2 bounded batch scorer only after owner census and exact CPU fixture parity; performance compare to GPU full roundtrip.

## N-ary NetworkX / RAPIDS alignment increment
- [x] NX-01 Added `python/atlas_compute/nary_networkx_alignment_v1.py`: deterministic bipartite packet↔fact incidence snapshot with typed role metadata, graph-revision checks, checksum and bounded CPU NetworkX neighborhood/Pagerank exploration. This is a **fixture-only CPU oracle**, not the canonical graph runtime or independent evidence verification.
- [x] NX-02 Added `python/tests/test_nary_networkx_alignment_v1.py`: four unit tests (authored, not executed remotely).
- [ ] NX-03 Execute `PYTHONPATH=python python -m unittest discover -s python/tests -p test_nary_networkx_alignment_v1.py -v` with NetworkX installed; verify fixture and compare with `python/atlas_graph_runtime/networkx_executor.py`. No duplicate production graph owner.
- [ ] NX-04 Adapt actual ontology-tuple NaryFactV1 participants/roles/evidence to the CPU oracle using independently verified packet/source/graph revisions. Current adapter trusts caller-supplied fact checksum and role labels.
- [ ] NX-05 Add exact graph snapshot ↔ cuGraph projection parity: identical packet/fact ordinals, incidence edges, directed semantics, PageRank tolerance, neighborhood membership, isolate handling, deterministic graph checksum. Require actual GPU compute proof, not `nx-cugraph` import.
- [ ] NX-06 Reuse existing `python/atlas_compute/gpu_mini_fabric/retrieval_01l_08a_cuvs_exact_v1.py`, `scripts/gpu/cuvs-bruteforce-smoke.py` and PyTorch/cuVS exact-TopK proof; compare frozen **semantic_768** vectors/metric/ordinal checksum to CPU NumPy. Do not run cuVS against N-ary graph incidence or 4×6 scoring tiles.
- [ ] NX-07 Add common request receipt binding graph candidate IDs and cuVS TopK IDs to revision-qualified candidates, without extra semantic vote in SearchRuntime.
- [ ] NX-08 Benchmark WSL/RAPIDS GPU availability, conversion overhead, execution time and peak VRAM with idle-owner allocation gate and failure receipts; no automatic service eviction or installs.

## DAG snapshot and event-state bridge
- [x] DAG-01 Source-search existing frozen DAG, mutation-gate, Oak execution and evidence receipt owners. No replacement authority is created.
- [x] DAG-02 Added `python/atlas_compute/dag_snapshot_state_v1.py` with revision-qualified immutable dependency DAG snapshot, cycle rejection, deterministic topological ordering and pure transition validator.
- [x] DAG-03 Added `python/tests/test_dag_snapshot_state_v1.py` (authored, not executed).
- [ ] DAG-04 Invoke tests using existing Python environment and prove non-mutating replay against TS `prove-frozen-dag-v1.mjs` and `parent-atlas-mutation-gate.mjs`.
- [ ] DAG-05 Do not write this Python oracle to Postgres as an independent authority. Integrate canonical execution receipts and evidence assertions with the existing OpenSpec schema/agent execution spine. Append events per run, enforce expected prior state, monotonic sequence, idempotency key, authorization and independently checked evidence.
- [ ] DAG-06 Add durable state projection derived from replayed events: PENDING→READY→RUNNING→SUCCEEDED/FAILED, cancellation, retries, lease expiry and worker readback. A graph edit creates a *new* DAG revision and invalidates stale run projection.
- [ ] DAG-07 Bind task scheduling to approved ContextManifest, packet/evidence revisions and cache generations; do not use token KV or NetworkX graph objects as durable state.
- [ ] DAG-08 Handle concurrently running nodes by per-run / per-step CAS or transaction and enforce dependency completion inside transaction; current pure state helper has no sequence monotonicity against external event history.

## CRUD proposal / incremental AST search subhelpers
- [x] SEARCH-01 Added `python/atlas_compute/graph_search_subhelpers_v1.py`: cosine, affine 0–100 cosine display scale (NOT calibrated probability), Manhattan, degree-1/2 binary interaction terms, bounded BFS, weighted A*, greedy best-first, NetworkX Louvain wrapper.
- [x] SEARCH-02 Added `python/tests/test_graph_search_subhelpers_v1.py` with scoring, binary and path fixtures. Authored but not run through GitHub connector.
- [ ] SEARCH-03 Test scalar metrics on mismatched dimensions, zeros, nonfinite values, negative feature inputs; document cosine rank vs Manhattan distance (different ordering) and query-specific normalization.
- [ ] SEARCH-04 Bind subhelpers to existing AST/Graphify typed edges and immutable revision-qualified node ordinals. BFS/A*/greedy operate on structural edge costs; HNSW adjacency is not a source-code graph.
- [ ] SEARCH-05 Community proof: reuse existing Louvain owner; Leiden support must be runtime-discovered and pinned (NetworkX version/backend support differs). Benchmark exact graph revision and community stability vs cuGraph.
- [ ] SEARCH-06 Define CRUD as proposal-only Create/Read/Update/Delete operations: Create/Update/Delete write NEW packet/DAG revisions through existing authorized mutation gate and independent readback; Read is bounded and revision-pinned. No direct Python graph mutation authorization.
- [ ] SEARCH-07 Record expansion cutoff, heuristic admissibility, visited-node count, negative control, graph revision and evidence IDs. A* optimality claim requires admissible heuristic; greedy has no optimality guarantee.
- [ ] SEARCH-08 Add QueryClassification → graph lane policy → candidate feature tile → SearchRuntime RRF → ContextManifest dry-run receipt. Separate structural traversal from 768D cosine similarity and from calibrated relevance.

## AST/CST → FastAPI NLP/SLM → Graphify fanout → DAG state closure (2026-10-07)
Source-only status. Smoke scripts and historical artifacts are not current live reachability proof.
- [x] PIPE-00 Trace `scripts/atlas/prove-ast-sidecar.mjs`, `scripts/atlas/run-nlp-classification-fastapi-smoke-v1.mjs`, `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-lifecycle-composition-v1.ts`, `sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-execution-adapter-v1.ts`. The OaK executor explicitly rejects mutation plans.
- [ ] PIPE-01 AST/CST authority census: locate parser owner, AST native node coordinates and CST concrete-token spans; prove that outputs share sourceRef, sourceRevision, workspaceRevision, node ID, parser version and provenance digest. Do not fabricate CST from AST node names.
- [ ] PIPE-02 Execute existing AST sidecar capability/negative-control probe against idle existing service; assert AST endpoint and native provenance fields, and mark CST separately supported/unsupported based on real output.
- [ ] PIPE-03 Run FastAPI `/health` `/analyze` `/classify` smoke with explicit model-revision/checkpoint readback; distinguish deterministic lexical/weak-label fallback from actually loaded SLM inference. FastAPI import/smoke does not mean a service is running.
- [ ] PIPE-04 Trace trained SLM checkpoint, tokenizer, model family, adapter/label taxonomy and inference owner. Require reproducible model digest, source-language/domain classification score, abstain threshold and CPU fallback behavior before promoting classifier output into fanout routing.
- [ ] PIPE-05 Freeze `QueryClassificationV1` and `AST/CST EvidenceV1` input adapter for Graphify. Record source/workspace/graph/taxonomy/model/feature revisions and exact evidence refs; no weak label becomes grounded fact by fanout.
- [ ] PIPE-06 Run `graphify-lifecycle-composition-v1` with one revision-qualified packet and read-only fanout harness; demonstrate open→fanout→close, typed edges/participant roles, rejected facts, step receipts, no unauthorized writes. Independently check source run/graph revision.
- [ ] PIPE-07 Route immutable graph snapshot to existing OaK DAG planner and CPU NetworkX cycle/topological proof. Proposals to add/remove edges create NEW DAG revision; do not mutate active run snapshot.
- [ ] PIPE-08 Integrate READY→RUNNING→SUCCEEDED/FAILED events with existing execution/evidence writer, not NetworkX or Redis. Enforce per-run/step expected state, monotonic sequence, idempotency, leases, transactional dependency checks, error classification, and readback.
- [ ] PIPE-09 Prove failure and retry: stale AST source revision, CST unavailable, missing SLM checkpoint, sidecar timeout, invalid N-ary roles, duplicate event, concurrent step claim, dependency cycle, worker crash and replay.
- [ ] PIPE-10 Read-only end-to-end receipt: query → AST/CST (where supported) → lexical/NLP classifier → Graphify typed/N-ary fanout → SearchRuntime candidates → ContextManifest → approved DAG; bind every checksum and event to same frozen snapshot.
- [ ] PIPE-11 Audit OpenSpec task-to-evidence mapping: record exact existing task IDs and owners before marking completion. A source fixture/pass never automatically closes a deployment gate.

## Async worker / stale tournament event gates
- [x] ASYNC-01 Source-located domain trainer `python/train_domain_classifier.py`, Python FastAPI `python/miniforge_nlp_sidecar.py`, Kafka proposal, Valkey HyperLogLog references, and existing OaK read-only DAG executor; no standalone production asyncio queue owner established.
- [x] ASYNC-02 Add pure read-only `python/atlas_compute/async_dag_worker_v1.py` with bounded IO/CPU/GPU semaphores, explicit external claim callback, pre-/post-await revision lease comparison, timeout/stale/failure receipts. A PROPOSED result is never auto-promoted to SUCCEEDED.
- [x] ASYNC-03 Add `python/tests/test_async_dag_worker_v1.py` for successful proposed result and post-await stale invalidation; authored, NOT executed.
- [ ] ASYNC-04 Execute tests via `PYTHONPATH=python python -m unittest discover -s python/tests -p test_async_dag_worker_v1.py -v`.
- [ ] ASYNC-05 Replace callback fixtures with authoritative OaK/PG transaction owner, claiming READY->RUNNING with expected state, generation, lease and dependency-complete conditions; emit durable failure/cancel/timeout receipts and consume idempotent event via existing Kafka outbox.
- [ ] ASYNC-06 Ensure cancellation closes or releases lease and persisted state is reconstructible after worker crash; the pure Python async helper intentionally does not enforce cross-process singleton GPU ownership.
- [ ] ASYNC-07 Route domain/intent classification, AST/CST, lexical and NetworkX as bounded work items. Invoke blocking CPU code via worker threads/processes only where measured; never call CPU-heavy synchronous functions directly in event loop.
- [ ] ASYNC-08 Bind cuVS/cuGraph work to existing single-owner GPU scheduler and explicit VRAM/availability gate; distinguish real GPU backend execution from NetworkX silent fallback.
- [ ] ASYNC-09 Stale tournament: freeze query and candidate snapshot, compare revisions+evidence+feature/model checksums, reject late/old results BEFORE RRF/ContextManifest and AFTER any await/readback. Record discarded attempts without promoting stale winner.
- [ ] ASYNC-10 HyperLogLog is approximate breadth telemetry (unique candidate IDs/domains/queries); NOT exact dedup, canonical ID registry, worker lease, event queue or freshness check. Add opt-in read-only command planning first, and delegate writes to existing Valkey telemetry owner only.
- [ ] ASYNC-11 Benchmark FIFO/concurrent worker backpressure, fairness, retries, lease expiry, cancellation and CPU/GPU conversion cost. Compare normal Python threads/processes vs free-threaded build only when dependencies support it; no environment changes as part of this task.

## Decision tree / HMM / supersession / KMeans alignment
- [x] POLICY-01 GitHub owner census: HMM docs/router and Kanban actions exist; domain NB/LR classifier and ListMLE policy reranker exist; KMeans scripts exist; no indexed `DecisionTreeClassifier` implementation found. Search results alone do not establish production runtime.
- [ ] POLICY-02 Define distinct FSM and HMM: RUNNING/FAILED/SUPERSEDED are deterministic workflow/attempt statuses; HMM hidden states are probabilistic inference outputs and never authorize state mutation.
- [ ] POLICY-03 Define immutable attempt identity: (run, DAG revision, step, attempt, source/workspace/graph/representation/model/feature revisions, lease generation). Finalize only with transactional compare-and-swap; stale attempt -> REJECTED_STALE, new graph revision -> SUPERSEDED, avoid mutating historic receipts.
- [ ] POLICY-04 Compare DecisionTree, LogisticRegression, Naive Bayes, XGBoost and MLP as offline *challengers* on frozen labels/feature schemas and query-separated splits. Use precision/recall/calibration for domain classification and MRR/nDCG for candidate ranking; record model checksum and train-only normalization.
- [ ] POLICY-05 Keep AdamW/backprop confined to neural model training (MLP/GNN), not DAG lifecycle transitions or supersession policy. Model promotion requires held-out metrics, human approval and immutable rollback pointer.
- [ ] POLICY-06 Inspect HMM action router producer/current consumers, transition/emission calibration and sequence labels. A posterior probability may suggest an eligible action but deterministic validation must check graph/evidence revisions, permissions and budgets.
- [ ] POLICY-07 KMeans unsupervised: reuse current scripts; fit only on revision-qualified frozen semantic_768 snapshot, save centroid/basis digest, cluster revision, seed and membership receipt. Do not promote clusters to evidence, packet identity or a second semantic vote.
- [ ] POLICY-08 Incremental graph/AST changes create new snapshot revision; compute affected dependency closure, invalidate feature tiles/candidate caches and supersede outstanding attempts without marking old results as wrong for their pinned snapshot.
- [ ] POLICY-09 Add tournament shadow replay with on-time/current, late/stale, superseded-model, stale-graph and invalid N-ary fact controls; final commit guarded in PostgreSQL event/evidence owner, not Redis or Python local state.

## Transactional DAG port implementation increment
- [x] CAS-01 Confirmed `sveltekit-frontend/src/lib/server/db/openspec-evidence-schema.ts` explicitly says OpenSpec evidence migrations are not applied and docs/reports receipts remain authority pending deployment/readback. This is not a verified running state table.
- [x] CAS-02 Added `sveltekit-frontend/src/lib/server/atlas/policy/dag-attempt-cas-v1.ts`: typed attempted READY→RUNNING and RUNNING→SUCCEEDED/FAILED/SUPERSEDED transitions, full revisions, lease/generation, expected row version, evidence digest, idempotency key and fail-closed transactional port.
- [x] CAS-03 Added `dag-attempt-cas-v1.spec.ts`: four Vitest cases for allowed/forbidden transitions, stale response, and mock transactional commit. **Not executed** through GitHub.
- [ ] CAS-04 Run focused Vitest on existing frontend installation. No dependency installs/migrations before operator review.
- [ ] CAS-05 Identify actual deployed DAG *run-state* table owner; OpenSpec evidence_receipts is a proof ledger, not automatically a step-claim table. Verify DB schema and migrations read-only; don't generate a parallel table from this scaffold.
- [ ] CAS-06 Implement transactional adapter against verified run-state owner: WHERE full attempt/revision/lease/generation/status/version, dependent-step completion and authorization, UPDATE RETURNING row plus append-only immutable event and outbox write in the *same transaction*. Reject zero/ambiguous rows.
- [ ] CAS-07 Recover after crash: expired leases, monotonic attempt generation, duplicate idempotency keys, competing worker claims, cancellation/timeout and supersession, verified via rollback/readback.
- [ ] CAS-08 Connect existing Python async worker `PROPOSED` output to this TypeScript port through approved sidecar RPC; never grant Python direct mutation ownership.
- [ ] CAS-09 Run read-only reconciliation of Graphify/AST/NLP source/graph/model revisions before and after worker await, then protected transaction at commit boundary. Return stale results without ContextManifest admission.

## Durable journal owner discovered — use before any new DAG state table
- [x] JOURNAL-01 Source-located `sveltekit-frontend/src/lib/server/db/schema/durable-execution.ts` and `sveltekit-frontend/drizzle/manual/0040_durable_execution_journal.sql`: execution_runs, execution_journal_steps, execution_dependencies, execution_side_effects.
- [x] JOURNAL-02 Existing journal statuses PENDING/EXECUTING/SUCCESS/FAILED/SKIPPED differ from experimental READY/RUNNING/SUCCEEDED/FAILED/SUPERSEDED. `durable-dag-status-adapter-v1.ts` maps `PENDING` to `null` (not `READY`), since this adapter cannot infer eligibility or dependency completion. Other unmatched states remain null; the activation gate remains separate.
- [x] JOURNAL-03 Added and executed `durable-dag-status-adapter-v1.spec.ts` with the CAS tests; both focused suites passed 6/6.
- [x] JOURNAL-09 Changed the compatibility projection so journal `PENDING` returns `null`, never experimental `READY`; focused status-adapter and CAS tests passed 6/6 on the normal frontend install. This is only a read-only status mapping correction and does not enable durable DAG activation.
- [x] JOURNAL-10 Hard-disable `canActivateJournalDagClaimsV1` even when its five caller-supplied booleans are true. Those booleans are assertions, not independently verified deployment/lease/fencing/transaction/dependency receipts; no non-test production caller exists. Durable DAG activation remains unavailable until a receipt-backed verifier and deployed transactional adapter are implemented and independently read back.
- [ ] JOURNAL-04 Read-only inspect actual PostgreSQL pg_catalog for table existence, columns, indexes, FK and applied migration receipt. Never equate Drizzle declaration with deployed schema.
- [ ] JOURNAL-05 Reconcile existing durable journal ownership with OaK bounded executor and OpenSpec proof ledger; execution journal != OpenSpec tasks.md evidence ledger.
- [ ] JOURNAL-06 Prove transactional attempt fencing. Existing declaration lacks dedicated lease ID/expiry, generation and state version fields; design additive migration under Drizzle safety review ONLY after verified owner/deployment. No migration generated or applied in this PR.
- [ ] JOURNAL-07 Implement one authorized transactional claim/completion+outbox adapter and run concurrent-worker, stale revision, crash, cancellation and replay tests; no direct Python writes.
- [ ] JOURNAL-08 Execute focused Vitest tests and TypeScript checks in existing repo environment; commit/test success was not established by GitHub API file writes.
- **2026-10-08 focused journal/CAS recheck:** from `sveltekit-frontend`, `dag-attempt-cas-v1.spec.ts` and `durable-dag-status-adapter-v1.spec.ts` passed 6/6. `PENDING` maps to `null`, and the activation helper remains fail-closed. This does not prove deployed PostgreSQL schema, transactional activation, or production callers; JOURNAL-04 through JOURNAL-08 remain open.
- **2026-10-08 post-merge status/orchestration recheck:** frontend Vitest passed 6/6 across durable journal status mapping, the Gemma model-literal guard, and the Gemma4 code-intelligence adapter. `PENDING` still cannot become `READY` through the compatibility adapter; the separate activation helper remains fail-closed. This is source/fixture evidence only and does not close JOURNAL-04..08 or establish live orchestration calls.
- **2026-10-08 PG18 rollback + deployed-schema recheck:** on the configured `legal_ai_db` (PostgreSQL 18.4), `prove-dag-outbox-idempotency-rollback-v1.sql` returned `FIXTURE_PASS`, one outbox event and `SUCCEEDED`; both temporary fixture relations were absent after `ROLLBACK`. Scratch receipt `.tmp/atlas/durable-journal-live-proof-v1-20261008-r2.json` (SHA-256 `BC74079CC08CD6F9E242BC7A5BCA5A9C05F6313B68DD6FD8404494837CD364D2`). This proves the isolated SQL fixture's rollback/idempotency behavior only, not concurrent workers or the deployed adapter. The read-only `pg_catalog` inventory found all four expected public journal tables absent (`execution_runs`, `execution_journal_steps`, `execution_dependencies`, `execution_side_effects`), hence no indexes or fencing columns; gate evaluator remains `BLOCKED` with activation unauthorized. This run applied no migration; historical migration receipt remains unverified. `JOURNAL-04..08` remain open; do not enable durable activation.
- **2026-10-08 GPU planner unit recheck:** `py -3.13 -m unittest python.tests.test_graph_gpu_proof_plan_v1 -v` passed 2/2. These tests assert fail-closed planning/readback semantics; they did not execute CUDA, cuGraph, or cuTile. GPU parity remains unproven and requires the documented resource/operator preflight.

## Offline Gemma/browser model-comparison admission (MODEL-ALIGN)
- **2026-10-09 scope:** These tasks are separate from the existing ALIGN-01..10 GPU/vector/ranker gates. NumPy CPU-reference tests passed 5/5 in the *local* Python 3.11.9 / NumPy 1.26.4 .venv per operator report; this GitHub edit does not rerun them. Gemma browser load, local ONNX external-weights completeness, cuVS parity and Vitest collection remain unproven. Preserve local uncommitted changes before any merge.
- [ ] MODEL-ALIGN-01 **Owner census and zero-install resolver check.** Inspect working-tree `sveltekit-frontend/src/lib/ai/onnx/token-sampling.ts`, `inference.spec.ts`, browser Gemma 4 Transformers.js adapter, Gemma 3 ONNX inference owner, GPU preflight, runtime-admission and receipt owners. Verify `onnxruntime-web`/`onnxruntime-node` declarations *and resolution* independently; do not install. Do not create duplicate sampler, manifest, GPU admission, or evidence writers. Record actual paths, refs and hashes.
- [ ] MODEL-ALIGN-02 **Pure deterministic sampler tests.** Keep existing `token-sampling.ts` as owner and remove runtime/import side effects from the *pure* helper path without altering existing public behavior. Cover empty logits; first-index tie; all `-Infinity` masked; `NaN` rejection; `+Infinity` policy; temperature=0; nonzero-temperature seeded determinism, top-k/top-p, mask and output IDs. Unit tests must collect with no ONNX, Transformers.js, browser, network or GPU imports. Separate `TEST_NOT_COLLECTED` from failed assertions.
- [ ] MODEL-ALIGN-03 **Frozen shared fixture and checksum.** Reuse existing manifest/packet identity owners; define `ComparisonFixtureV1` with canonicalId, packetKey, symbolVersionId (optional only when legitimately non-symbol), workspace/source/representation revisions, model/tokenizer revisions, prompt bytes/token IDs, attention masks, dtype/shape, decoding config, expected task type and explicit comparison class. Canonical checksum uses stable encoding, domain/version separation, and test vectors; no assumption that different Gemma generations produce identical output tokens.
- [ ] MODEL-ALIGN-04 **Artifact preflight before inference.** Inventory local Gemma 4 ONNX and external-data references without loading graph execution; 647 KB graph size alone is inconclusive. Verify every declared external tensor path stays inside approved model directory, exists, has trustworthy expected size/digest, and that tokenizer/config/generation assets and model revision agree. Missing expected manifest -> `ARTIFACT_UNVERIFIED`, not `PASS`. No remote fallback.
- [ ] MODEL-ALIGN-05 **Offline browser/WebGPU admission.** On a user-approved browser session only, check secure context, `navigator.gpu`, adapter/limits, required shader-f16/operators, admission token, approved origin and explicit memory budget. Before any model constructor/download set Transformers.js local-only policy (`env.allowRemoteModels = false`; local path configured intentionally) and prove rejected admission causes zero model requests and zero GPU allocation with mocks. Do not infer GPU memory available from adapter limits; measure or conservatively budget VRAM externally. Do not run `npm run dev:gpu` for browser-only proof.
- [ ] MODEL-ALIGN-06 **Comparison executor and typed receipts.** Dispatch only supported comparison classes (same-model backend numerical parity, cross-model quality comparison, numeric NumPy/cuVS parity are DIFFERENT tasks). Bind fixture digest, authoritative packet and model/tokenizer/runtime revisions, engine/provider version, start/end snapshots, output digest, resource metrics and evidenceRefs. Status `NOT_RUN|BLOCKED|UNSUPPORTED|PASS|FAIL`; no stale or partial receipt may enter ContextManifest. Reuse existing evidence receipt writer, never create an alternate source of truth.
- [ ] MODEL-ALIGN-07 **Executed negative controls and promotion boundary.** Run pure fixture/sampler/admission/artifact tests with bounded single-worker runner; prove no network/model GPU operations during offline test collection; emit test evidence for missing external weights, path traversal, mismatched tokenizer, stale source/fixture, missing WebGPU, blocked network, model backend unsupported, all-masked logits and runner timeouts. Independently verify readback/receipt digest before marking `OFFLINE_COMPARISON_HARNESS_READY`. Gemma 4 parity, cuVS parity, model loading and ContextManifest admission remain separate later gates.
- **Safety/ownership constraints:** No dependency installation, remote weights/download, model initialization, GPU memory reservation/restart, DB/Qdrant/Neo4j/Valkey mutation, new canonical owner or speculative PASS. Preserve the existing ALIGN-07..10 meanings. Consult local working tree before editing files that are absent on GitHub main.
