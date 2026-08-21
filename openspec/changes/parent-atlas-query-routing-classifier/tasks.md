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
- Deterministic query/POS-like features are cheap planner inputs, not linguistic
  evidence authority.
- The learned router predicts stable logical needs; it does **not** predict
  infrastructure product names.
- `LANE != EXECUTOR`: Qdrant HNSW, pgvector, cuVS brute-force, CAGRA, Vamana,
  DiskANN, BM25, miniCOIL, SPLADE and rerankers are selected by deterministic
  capability policy after classification.
- BM25 / miniCOIL / SPLADE are alternative sparse executors feeding one logical
  sparse contribution. They are never independent vote inflation.
- miniCOIL requires Qdrant collection-level IDF when used.
- Qdrant/FastEmbed BM25 requires Qdrant collection-level IDF when used.
- SPLADE is a separate sparse vocabulary-expansion representation.
- DiskANN/Vamana and HNSW/CAGRA are ANN/index executors, not embedding models.
- Cross encoders remain a separate joint query-document task; dense MRL does not
  replace them without measured reranker parity.
- Query-router model comparisons use one immutable dataset and one stable
  `SHA256(query_id)` 80/10/10 split so model choice cannot change test membership.

## NLP-0 — inventory existing classifier owners

- [x] Existing MiniLM intent manifest located at
  `atlas/neural-routing/encoder-manifest.ts`.
- [x] Existing MiniLM cross-encoder manifest retained as a separate reranking
  benchmark.
- [x] Existing XGBoost classifier/training machinery identified; no third
  canonical classifier owner is introduced.

## NLP-1 — QueryClassificationV2

- [x] Add `atlas.query-classification.v2`.
- [x] Predict domain and operation separately.
- [x] Predict retrieval needs independently:
  lexical exact, contextual sparse, expansion sparse, dense semantic, AST,
  graph, exact symbol and mutation freshness.
- [x] Predict bounded candidate / graph-hop / rerank budgets.
- [x] Classification output has `evidenceAuthority=false`.
- [ ] Execute schema tests on the workstation.

## NLP-2 — deterministic query/POS-like feature projection

- [x] Add a dependency-free 26-feature baseline.
- [x] Freeze feature ordering before training.
- [x] Include identifier/path/case shape, verb/noun-like density, debug,
  mutation, comparison, graph, database, retrieval, API and testing terms.
- [x] Mark heuristic POS-like features non-authoritative.
- [ ] Compare later against a real POS tagger only if it materially improves the
  evaluation corpus; do not change the v1 tensor ordering silently.

## NLP-3 — EmbeddingGemma classification feature

- [x] Freeze prompt revision:
  `task: classification | query: ...`.
- [x] Freeze source representation `classification_768`.
- [x] Freeze router representation `classification_mrl_128`.
- [x] Freeze projection `MRL_PREFIX_TRUNCATE_L2`.
- [x] Dataset exporter can bind to the proven Ollama executor or an
  OpenAI-compatible embedding endpoint without changing representation identity.
- [ ] Produce fixture embeddings with the proven EmbeddingGemma executor.
- [ ] Verify 128-d norm/digest determinism on the exported corpus.

## NLP-4 — router tensor / dataset

- [x] Tensor width frozen to 154:
  - 128 EmbeddingGemma classification MRL values
  - 26 deterministic query features
- [x] Feature contract revision `atlas.query-router-tensor.v1`.
- [x] Add `atlas.query-router-seed.v1` reviewed-label input contract.
- [x] Add `atlas.query-router-dataset-row.v1` revision-qualified training row.
- [x] Add `build-query-router-dataset.mts` exporter.
- [x] Exporter requires query + label revisions and rejects duplicate IDs/text.
- [x] Exporter verifies native finite 768-d EmbeddingGemma output before deriving
  `classification_mrl_128` by prefix truncation + L2 normalization.
- [x] Exporter emits only JSONL + receipt; no Qdrant/Postgres/Valkey writes.
- [x] Freeze deterministic budget normalization and retrieval-need ordering.
- [x] Add dataset contract tests.
- [ ] Execute dataset contract tests.
- [ ] Produce a reviewed non-toy seed corpus (minimum 30 rows; larger preferred).
- [ ] Export the frozen corpus and verify one model/prompt/feature revision across
  all rows.

## NLP-5 — PyTorch multi-head baseline

- [x] Add `train-query-router-pytorch.py`.
- [x] Small LayerNorm/Linear/GELU MLP.
- [x] Heads: domain, operation, retrieval-needs, budget.
- [x] Cross entropy for categorical heads; BCE for multi-label needs; bounded
  regression for budgets.
- [x] AdamW + gradient clipping.
- [x] Replace framework-specific random split with stable
  `SHA256(query_id)` 80/10/10 train/validation/test membership.
- [x] Emit test-set probabilities for same-corpus evaluation.
- [x] Optional ONNX export through `torch.onnx.export(..., dynamo=True)`.
- [ ] Execute training on a revisioned non-toy dataset.
- [ ] Run calibration/ECE evaluation from emitted probabilities.

## NLP-5B — XGBoost same-task baseline

- [x] Add `train-query-router-xgboost.py`.
- [x] Do **not** reuse the legacy `best_retrieval_lane` labels as the comparison
  target.
- [x] Train domain and operation with `multi:softprob`.
- [x] Train eight retrieval-need probability heads with `binary:logistic`.
- [x] Train three normalized budget regressors with `reg:squarederror`.
- [x] Use the identical `SHA256(query_id)` 80/10/10 split as PyTorch.
- [x] Emit test-set probabilities keyed by query ID.
- [ ] Execute on the frozen non-toy dataset.

## NLP-6 — deterministic executor capability policy

- [x] Add `RetrievalExecutorCapabilityV1` and `RetrievalPlanV1`.
- [x] Default active baselines remain Postgres FTS, Qdrant semantic-768 HNSW,
  pgvector exact, AST and bounded graph.
- [x] Keep unproven challengers unavailable by default:
  Qdrant BM25, miniCOIL, SPLADE, cuVS exact, CAGRA, cuVS Vamana, DiskANN/Vamana,
  cross encoder.
- [x] miniCOIL chosen for contextual exact-overlap need when proven available.
- [x] SPLADE chosen for lexical-expansion need when proven available.
- [x] DiskANN/Vamana only considered for explicitly enabled disk-ANN and larger
  candidate budgets.
- [x] cuVS/CAGRA only considered when GPU capability is explicitly available.
- [x] `oneVotePerLogicalLane=true` invariant.
- [ ] Wire availability from real service/capability receipts rather than static
  defaults.

## ANN-0 — current persistent ANN baseline

- [ ] Confirm current `semantic_768` Qdrant HNSW collection owner after EMB3A
  lineage proof (`codebase_chunks_768` vs `_v2`).
- [ ] Record HNSW `m`, `ef_construct`, query `hnsw_ef`, quantization and on-disk
  configuration in a revisioned receipt.
- [ ] Measure recall against cuVS brute-force exact top-K before tuning.

## ANN-1 — cuVS exact / CAGRA

- [ ] Reuse the existing RAPIDS sidecar proof path.
- [ ] `cuvs_bruteforce_768` is the GPU exact semantic oracle, not an extra lane.
- [ ] `cuvs_cagra_768` is an approximate executor challenger.
- [ ] Measure Recall@K, p50/p95, VRAM, build/load cost and fallback behavior.

## ANN-2 — Vamana / DiskANN

- [ ] Treat Microsoft DiskANN3 as a separate SSD/disk ANN challenger.
- [ ] Treat cuVS Vamana as a separate GPU/library implementation challenger.
- [ ] Do not call either canonical because the algorithm family is named Vamana.
- [ ] Benchmark on the same immutable semantic_768 snapshot and exact oracle.
- [ ] Record storage provider, build parameters, vector dtype, distance metric,
  index bytes, resident RAM, p50/p95 and Recall@K.
- [ ] Test filtered ANN separately from unfiltered ANN.
- [ ] No production index activation until measured benefit over Qdrant HNSW.

## SPARSE-0 — baseline ownership

- [ ] Keep Postgres FTS as deterministic lexical baseline.
- [ ] Audit the current `lexical_v1` owner and legacy BM42 artifacts.
- [ ] Never restore 384/MiniLM as canonical dense semantics.

## SPARSE-1 — Qdrant BM25

- [ ] Isolated fixture collection only.
- [ ] Configure sparse vector with `Modifier.IDF`.
- [ ] Record corpus tokenizer/avg-length/IDF lineage.
- [ ] Compare to Postgres FTS on exact symbol, rare identifier and natural
  language queries.

## SPARSE-2 — miniCOIL

- [ ] Isolated fixture collection only.
- [ ] Configure sparse vector with `Modifier.IDF`.
- [ ] Record exact `Qdrant/minicoil-v1` model revision/license/runtime.
- [ ] Evaluate identifier overlap + contextual disambiguation.
- [ ] No EmbeddingGemma-MRL substitution; future EmbeddingGemma-token miniCOIL is
  a new trained model and separate OpenSpec.

## SPARSE-3 — SPLADE

- [ ] Isolated fixture collection only.
- [ ] Record exact SPLADE vocabulary/model revision/license/runtime.
- [ ] Evaluate queries where relevant candidates have weak/no lexical overlap.
- [ ] Keep vocabulary expansion separate from dense semantic evidence.

## NLP-7 — same-corpus router evaluation

- [x] Add `evaluate-query-router-models.py`.
- [x] Evaluator requires exact query-ID parity against the frozen stable test set.
- [x] Metrics implemented for classifier-only comparison:
  domain macro-F1, operation macro-F1, retrieval-need F1/AUROC/Brier/ECE,
  domain/operation ECE and budget MSE.
- [ ] Freeze reviewed query corpus and relevance judgments.
- [ ] Execute PyTorch and XGBoost on the exact same frozen dataset.
- [ ] Add static-rule prediction export using the same test IDs.
- [ ] Retrieval-level follow-on metrics after shadow execution:
  Recall@10/50/100, MRR, NDCG, exact-promotion rate, execution success,
  stale-evidence rate, p50/p95 latency, CPU/GPU time, tool calls and tokens.
- [ ] Learned router must beat or materially simplify the static policy before
  promotion.

## NLP-8 — shadow runtime

- [ ] Run classifier beside current routing only.
- [ ] Emit recommendation/receipt; do not change retrieval execution.
- [ ] Compare planned vs actual successful lane usage.

## NLP-9 — promotion gate

- [ ] Require NLP-3 through NLP-8 evidence.
- [ ] Require fail-open static fallback.
- [ ] Require no canonical identity changes.
- [ ] Require no logical-lane vote inflation.
- [ ] Promotion changes routing policy only, never evidence authority.

## Validation commands

```bash
cd sveltekit-frontend

npx vitest run \
  src/lib/server/atlas/neural-routing/query-routing-v2.spec.ts \
  src/lib/server/atlas/neural-routing/query-router-dataset-v1.spec.ts

python scripts/atlas/train-query-router-pytorch.py --help
python scripts/atlas/train-query-router-xgboost.py --help
python scripts/atlas/evaluate-query-router-models.py --help

# Seed contract only — no embedding calls or artifact writes
npx tsx scripts/atlas/build-query-router-dataset.mts \
  --input <reviewed-seeds.jsonl> \
  --dry-run
```

Actual corpus export/training remains blocked until a reviewed revision-qualified
seed JSONL exists. No Qdrant, Postgres, Valkey, Graphify, ANN index,
model-residency or canonical writes are authorized by this change.
