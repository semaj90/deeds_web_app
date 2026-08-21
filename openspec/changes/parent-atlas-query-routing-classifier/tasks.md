# Parent Atlas Query Routing Classifier — proof tasks

Status date: 2026-08-20

This change is additive and non-authoritative. It does not change canonical
EmbeddingGemma ownership, Qdrant data, retrieval scoring, Graphify APPLY, or
canonical identity. `WRITTEN != WIRED != PROVEN`.

## Frozen boundaries

- EmbeddingGemma owns the dense semantic/classification representation family.
- Query classification uses the official classification task prefix and a
  `classification_768 -> classification_mrl_128` truncate + L2 projection.
- 384 is not an EmbeddingGemma MRL representation.
- Deterministic query/POS-like features are cheap planner inputs, not linguistic evidence authority.
- The learned router predicts stable logical needs; it does **not** predict infrastructure product names.
- `LANE != EXECUTOR`: Qdrant HNSW, pgvector, cuVS brute-force, CAGRA, Vamana, DiskANN, BM25, miniCOIL, SPLADE and rerankers are selected by deterministic capability policy after classification.
- BM25 / miniCOIL / SPLADE are alternative sparse executors feeding one logical sparse contribution. They are never independent vote inflation.
- Cross encoders remain a separate joint query-document task; dense MRL does not replace them without measured reranker parity.
- Query-router model comparisons use one immutable dataset and stable `SHA256(query_id)` 80/10/10 membership.

## NLP-0 — inventory existing classifier owners
- [x] Existing MiniLM intent manifest located.
- [x] Existing MiniLM cross-encoder retained as separate reranking benchmark.
- [x] Existing XGBoost machinery identified; no third canonical owner introduced.

## NLP-1 — QueryClassificationV2
- [x] Domain and operation heads.
- [x] Retrieval needs: lexical exact, contextual sparse, expansion sparse, semantic, AST, graph, exact symbol, mutation freshness.
- [x] Bounded candidate / graph-hop / rerank budgets.
- [x] `evidenceAuthority=false`.
- [ ] Execute schema tests on workstation.

## NLP-2 — deterministic query/POS-like feature projection
- [x] Dependency-free 26-feature baseline and frozen ordering.
- [x] Identifier/path/case shape, noun/verb-like density, debug/mutation/comparison/graph/database/retrieval/API/test features.
- [ ] Compare a real POS tagger only if it materially improves evaluation; do not mutate v1 ordering.

## NLP-3 — EmbeddingGemma classification feature
- [x] Prompt revision: `task: classification | query: ...`.
- [x] `classification_768 -> classification_mrl_128` prefix truncation + L2.
- [x] Dataset exporter supports the proven Ollama executor or OpenAI-compatible embedding endpoint without changing representation identity.
- [ ] Produce fixture embeddings with proven executor and verify norm/digest determinism.

## NLP-4 — router tensor / dataset
- [x] Tensor width 154 = 128 EmbeddingGemma classification MRL + 26 query features.
- [x] `atlas.query-router-seed.v1` reviewed-label input contract.
- [x] `atlas.query-router-dataset-row.v1` revision-qualified training row.
- [x] `build-query-router-dataset.mts` exporter.
- [x] Requires query/label revisions; rejects duplicate IDs/text.
- [x] Verifies finite native 768-d output before deriving MRL128.
- [x] Emits JSONL + receipt only; no Qdrant/Postgres/Valkey writes.
- [x] Minimum 30 reviewed seeds, matching train/validation/test trainer requirements.
- [x] Dataset contract tests added.
- [ ] Execute tests and export reviewed non-toy corpus.

## NLP-5 — PyTorch multi-head baseline
- [x] `train-query-router-pytorch.py` with LayerNorm/Linear/GELU MLP.
- [x] CE categorical heads, BCE retrieval-needs head, bounded budget regression.
- [x] AdamW + gradient clipping.
- [x] Stable SHA256(query_id) 80/10/10 split.
- [x] Emits test-set probabilities keyed by query ID.
- [x] Optional `torch.onnx.export(..., dynamo=True)`.
- [ ] Execute training on frozen corpus.

## NLP-5B — XGBoost same-task baseline
- [x] `train-query-router-xgboost.py`; does not reuse legacy `best_retrieval_lane` target.
- [x] Domain/operation `multi:softprob`.
- [x] Eight `binary:logistic` retrieval-need heads preserving [0,1] training targets; threshold only for classification metrics.
- [x] Three `reg:squarederror` budget heads.
- [x] Same SHA256(query_id) 80/10/10 split and test predictions.
- [ ] Execute on frozen corpus.

## NLP-6 — deterministic executor capability policy
- [x] `RetrievalExecutorCapabilityV1` and `RetrievalPlanV1`.
- [x] Active baselines: Postgres FTS, Qdrant semantic-768 HNSW, pgvector exact, AST, bounded graph.
- [x] BM25/miniCOIL/SPLADE/cuVS/CAGRA/Vamana/DiskANN/cross-encoder challengers remain unavailable until proof.
- [x] One vote per logical lane.
- [ ] Bind availability to real capability receipts.

## ANN-0 — Qdrant HNSW baseline
- [ ] Confirm `semantic_768` collection owner after EMB3A lineage proof.
- [ ] Record HNSW/quantization/on-disk parameters.
- [ ] Compare Recall@K against cuVS brute-force exact oracle.

## ANN-1 — cuVS exact / CAGRA
- [ ] Reuse existing RAPIDS proof path; same semantic lane, no extra vote.
- [ ] Measure Recall@K, p50/p95, VRAM, build/load and fallback.

## ANN-2 — Vamana / DiskANN
- [ ] Microsoft DiskANN/Vamana and cuVS Vamana are separate executor implementations.
- [ ] Same immutable semantic_768 snapshot and exact oracle.
- [ ] Record storage/build/dtype/distance/index bytes/RAM/latency/Recall@K and filtered parity.
- [ ] No production activation without measured advantage over Qdrant HNSW.

## SPARSE-0..3
- [ ] Postgres FTS remains deterministic lexical baseline.
- [ ] Audit lexical_v1 / legacy BM42.
- [ ] Qdrant BM25 isolated fixture with IDF lineage.
- [ ] miniCOIL isolated fixture with IDF, exact model revision/license/runtime; no EmbeddingGemma-MRL substitution.
- [ ] SPLADE isolated fixture with vocabulary/model revision and weak-overlap evaluation.

## NLP-7 — same-corpus router evaluation
- [x] `evaluate-query-router-models.py`.
- [x] Requires exact query-ID parity with stable test set.
- [x] Domain/operation macro-F1 + ECE; retrieval-need F1/AUROC/Brier/ECE; budget MSE.
- [x] Graded retrieval targets are thresholded at 0.5 only for binary evaluation truth, not discarded during training.
- [ ] Freeze reviewed corpus and run PyTorch/XGBoost.
- [ ] Add static-rule prediction export with same IDs.
- [ ] After shadow execution add retrieval metrics: Recall@10/50/100, MRR, NDCG, promotion/execution/staleness/latency/tool/token metrics.

## NLP-8 — shadow runtime
- [ ] Emit recommendations/receipts beside current router; do not change execution.

## NLP-9 — promotion
- [ ] Require NLP-3 through NLP-8 evidence, static fallback, identity invariants and no vote inflation.

## Validation commands
```bash
cd sveltekit-frontend
npx vitest run \
  src/lib/server/atlas/neural-routing/query-routing-v2.spec.ts \
  src/lib/server/atlas/neural-routing/query-router-dataset-v1.spec.ts
python scripts/atlas/train-query-router-pytorch.py --help
python scripts/atlas/train-query-router-xgboost.py --help
python scripts/atlas/evaluate-query-router-models.py --help
npx tsx scripts/atlas/build-query-router-dataset.mts --input <reviewed-seeds.jsonl> --dry-run
```

Actual corpus export/training remains blocked until a reviewed revision-qualified seed JSONL exists. No Qdrant, Postgres, Valkey, Graphify, ANN-index, model-residency or canonical writes are authorized by this change.
