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
