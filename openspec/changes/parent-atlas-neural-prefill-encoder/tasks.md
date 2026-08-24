# Parent Atlas Neural Pre-Fill Encoder — Tasks

## Status Rule

A checked item means the named contract or code slice exists. It does not
prove live training, GPU execution, projection parity, or production adoption.

## Evidence-Based Progress Snapshot

These are implementation-readiness estimates, not production completion
claims, based on the current repository inventory:

| Lane | Progress | Evidence | Remaining proof |
|---|---:|---|---|
| EmbeddingGemma `semantic_768` authority | 85% | Go embedding/retrieval services, Qdrant `semantic_768`, cache and contracts | current end-to-end receipt and stale-revision proof |
| Qdrant semantic/RFF fan-out | 48% | semantic/signature prefetch and RRF path; bounded RFF writer exists; 384 lane now explicitly marked direct-slice compatibility | live dry-run is `BLOCKED_DIMENSION_CONTRACT`; error lane is `vector(384)`, signature lane is `halfvec(768)` |
| `latent_128` warm representation | 25% | manifest, adaptive-memory contracts, provisional backfill script | learned post-fan-out encoder and promotion gate |
| `latent_64` hot representation | 30% | vector manifest, simulated Phase 5 bridge, residency tests | trained nested encoder and LibTorch parity |
| LibTorch/RTX inference | 45% | native addon and GPU wrappers exist | model loading, CPU/RTX parity, no-fallback receipt |
| XGBoost ranking/domain head | 55% | trainer, GPU device gate, feature export commands | post-fan-out latent features and live NDCG proof |
| Logistic/NB baselines | 15% | available contracts/capability surfaces | reproducible baseline artifacts and comparison |
| ACE/Valkey/SOM pre-fill | 40% | cache/SOM contracts and packet paths | projection wiring after latent promotion |
| MiniCoil/uniCOIL/SPLADE bi-encoder sparse lane | 10% | discovery terms and sparse adapter surfaces only | model/runtime owner, vocabulary, sparse index, and recall proof |
| Candidate matrix to low-rank shortlist | 25% | 25-column TypeScript matrix; deterministic PyTorch low-rank nomination primitive | live 512-to-96 receipt joined to RRF candidates and exact-rerank quality proof |

**Overall weighted readiness: approximately 39%.** This is not a claim that
39% of production traffic is covered; the main blocker is the missing learned,
revisioned encoder and post-fan-out projection proof.

Latest live gate: `docs/reports/graphify-rff-embedding-backfill-v1.json`
reported `BLOCKED_DIMENSION_CONTRACT` for a read-only limit-64 run on
2026-08-24. No rows or projections were written. The RFF contract must be
reconciled before `latent_128` can be promoted after fan-out. A separate legacy
Phase 1 dry-run reached Ollama and generated a 256-row sample, but its source
still targets the legacy 384-dimensional schema; this is execution evidence,
not a successful write or 768 migration.

Latest read-only readiness proof: `node scripts/atlas/autoencoder-dataset-readiness.mjs --dry-run --analyze`
completed successfully. It found identity coverage at 100%, topology coverage
at 100%, canonical embedding coverage at 99.9%, AST coverage at 20.3%, and
entity coverage at 0%. The readiness tool therefore does not authorize
autoencoder training; AST/entity pre-fill remains the current dataset gate.
Focused proof also passed with `python -m pytest -q
python/test_atlas_compute.py python/test_latent_autoencoder.py` (`13 passed`).

## File-level wiring inventory

This inventory prevents the training and retrieval gates from becoming
parallel implementations. Status uses the GAN validation vocabulary:
`CREATED`, `WIRED`, `PROVEN`, `DONE`.

| Surface | Existing owner | State | Next proof |
|---|---|---|---|
| Candidate feature matrix | `sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts` | CREATED | join to a frozen RRF candidate snapshot |
| Low-rank nomination | `python/atlas_compute/low_rank.py` | CREATED + unit-proven | live `SAMPLE_CANDIDATES` receipt with 512 -> 96 ordinals |
| Nested encoder | `python/atlas_compute/latent_autoencoder.py` | CREATED + unit-proven | dataset training receipt and retrieval-preservation evaluation |
| Encoder dataset readiness | `scripts/atlas/autoencoder-dataset-readiness.mjs` | WIRED as CLI | dry-run/export receipt with revision and memory bounds |
| Exact GPU oracle | `python/atlas_rapids_sidecar.py`, `scripts/gpu/cuvs-bruteforce-smoke.py` | RUNTIME-PROVEN on bounded fixtures | 20K semantic_768 recall and memory benchmark |
| CAGRA challenger | `scripts/gpu/cuvs-cagra-persistent-smoke.py` | RUNTIME-PROVEN on tiny fixture; quarantined | filter, revision swap, fallback, and corpus recall gates |
| SOM/routing | `python/atlas_compute/som.py`, `python/atlas_compute/aligned_snapshot_experiment.py` | CREATED + fixture evidence | candidate reduction versus KMeans baseline |
| Domain schema | `packages/semantic-contracts/src/domain-prediction.ts`, `packages/semantic-contracts/schemas/domain-prediction.schema.json` | CREATED | `.okf`-validated domain coverage and held-out accuracy |
| Ontology schema | `packages/semantic-contracts/src/ontology-proposal.ts`, `packages/semantic-contracts/schemas/ontology-proposal.schema.json` | CREATED | grounded tuple/evidence validation |
| QLoRA tuple contract | `packages/parent-atlas/src/core/qlora-dataset-export.ts` | CREATED + contract-tested | verified tournament-only export |
| QLoRA export | `scripts/atlas/generate-qlora-data.mjs` | WIRED as bounded CLI | replay/provenance report; no training claim |
| QLoRA audit | `scripts/atlas/audit-p7-qlora-ppo-export.mjs` | CREATED | distinguish artifact readiness from adapter quality |
| GGUF conversion | `scripts/convert-embeddinggemma-to-gguf.ps1` | CREATED | model checksum, dimensions, normalization, parity receipt |
| TurboQuant runtime | `scripts/launch-turboquant.ps1` | CREATED/runtime-dependent | live endpoint and quantized retrieval quality receipt |
| LangExtract bridge | `scripts/langextract/langextract-gemma4-bridge.py` | CREATED | source-grounded extraction and rejection of ungrounded tuples |
| Tournament planner | `scripts/atlas/agentic-toolgan-plan.mjs`, `scripts/atlas/agentic-toolgan-execute.mjs` | CREATED | three-candidate replay and deterministic ranking receipt |
| Replay validator | `scripts/atlas/agentic-toolgan-replay.mjs`, `scripts/atlas/audit-replay-validation.mjs` | WIRED as validators | frozen snapshot replay rate and identity checks |
| Docs acquisition | `scripts/docs-atlas/crawl-okf-dev-docs.mts`, `python/atlas_external_docs.py`, `scripts/docs-atlas/fetch-beautifulsoup.py` | WIRED as Firecrawl -> BeautifulSoup -> native fallback | fetched corpus under `docs/.okf/dev/raw` with fetcher and checksum metadata |
| Docs symbol index | `scripts/docs-atlas/index-okf-dev-corpus.mjs` | CREATED + dry-run proven | crawl corpus, then emit `docs/.okf/dev/symbol-index.jsonl` |

Names without a verified owner or artifact, including `quanterion` and
`ornith`, remain `UNRESOLVED`; they are not added as dependencies or model
choices by this change.

Latest docs proof: a bounded one-page Firecrawl fetch completed for the
Firecrawl API introduction and wrote `docs/.okf/dev/corpus.jsonl`, raw
markdown, and metadata. The symbol indexer then completed and wrote
`docs/.okf/dev/symbol-index.jsonl` plus `symbol-summary.json`; that page had
zero fenced TypeScript/JavaScript blocks, so symbol count was zero. This is a
valid empty extraction, not evidence that the AST lane is complete.

## P0 — Contracts and provenance

- [ ] NE-01 Define `NeuralEncoderManifestV1`, `NeuralPrefillRowV1`,
  `EncoderEvaluationReceiptV1`, and `LatentProjectionReceiptV1`.
- [ ] NE-02 Reconcile the existing `latent_64` vector manifest with the new
  model contract without changing canonical `semantic_768` ownership.
- [ ] NE-02A Reconcile `latent_128` as the warm post-fan-out representation;
  its source must be the joined candidate snapshot, not an arbitrary Qdrant
  scroll.
- [ ] NE-03 Add model, dataset, normalization, source, feature, and projection
  revision fields to all receipts.
- [ ] NE-04 Define `.okf` validation gates for domain, ontology, provenance,
  trust, lifecycle, and revision fields.
- [ ] NE-04A Define separate `error_embedding_768` and
  `signature_embedding_768` revisions; retain legacy 384 columns as
  `LEGACY_COMPATIBILITY` until recall promotion.
- [ ] NE-04B Add independent graph-input and graph-receipt checks so an
  embedding dimension block cannot be reported as PageRank, NetworkX, Neo4j,
  or cuGraph algorithm failure.

## P0 — NLP pre-fill

- [ ] NE-05 Read daily Graphify indexed files using canonical identity joins.
- [ ] NE-06 Replace regex-only symbol extraction in the active backfill with
  AST-grep structural extraction where the source language is supported.
- [ ] NE-07 Emit deterministic lexical keyword classes and preserve raw terms.
- [ ] NE-08 Emit validated domain classifications and ontology linked tuples.
- [ ] NE-09 Add AST/lexical/domain/ontology/topology coverage metrics and a
  read-only report.
- [ ] NE-10 Prove rerunning the same source revision produces no semantic
  changes.
- [ ] NE-10A Attach the pre-fill receipt to the Qdrant/RFF fan-out revision and
  preserve the canonical identity join through RRF.
- [ ] NE-10B Record degraded graph-candidate joins separately from valid
  PageRank/PPR/community computation receipts.

## P0 — Training dataset

- [ ] NE-11 Export canonical `semantic_768` rows plus pre-fill features to a
  revisioned Arrow/NDJSON dataset.
- [ ] NE-12 Split by source/workspace revision to prevent file-level leakage.
- [ ] NE-13 Record missing-vector, duplicate-identity, stale-revision, and
  invalid-ontology exclusions.
- [ ] NE-14 Add bounded dry-run training and memory estimates for the RTX 3060
  Ti and 8 GB host-memory constraint.

## P1 — Neural encoder

- [ ] NE-15 Implement the Python nested autoencoder `768 -> 256 -> 128 -> 64`
  and mirrored decoder with deterministic seeds.
- [ ] NE-16 Train reconstruction and retrieval-preservation objectives.
- [ ] NE-17 Save weights, normalization, metrics, dataset checksum, and device
  receipt as one immutable model bundle.
- [ ] NE-18 Add CPU reference inference and deterministic checksum tests.
- [ ] NE-19 Load the model through the existing LibTorch/N-API bridge.
- [ ] NE-20 Prove CPU/LibTorch CPU/RTX output parity within a recorded tolerance.
- [ ] NE-21 Remove the simulated Phase 5 path from promotion eligibility while
  retaining it as an explicitly labelled diagnostic fallback.

## P1 — Retrieval and learning heads

- [ ] NE-22 Benchmark `semantic_768` versus `latent_64` nearest-neighbor recall.
- [ ] NE-23 Build a bounded cuVS/Qdrant latent admission index only after the
  recall gate passes.
- [ ] NE-23A Enforce `semantic_768 query -> RFF/Qdrant fan-out -> latent_128`
  candidate encoding; reject pre-fan-out latent writes.
- [ ] NE-23B Add a query/candidate representation compatibility gate covering
  model revision, `QUERY`/`DOCUMENT` encoder roles, representation family,
  output dimension, normalization, and metric.
- [ ] NE-23C Require MRL query/candidate pairs to use the same EmbeddingGemma
  revision, task roles, MRL prefix dimension, renormalization, and metric;
  require learned latent pairs to use the same learned projection revision and
  normalization.
- [ ] NE-23D Add a bounded `SAMPLE_CANDIDATES` proof using the existing
  CandidateFeatureMatrix and a deterministic low-rank row projection. The
  receipt must preserve CandidateOrdinals, record rank/target count/device,
  and explicitly identify the policy as Tang-inspired rather than Tang's
  algorithm.
- [ ] NE-23E Compare the low-rank nomination against exact ranking on the same
  frozen candidate snapshot; record Recall@K, NDCG/MRR, top-K overlap, latency,
  and CPU/RTX memory telemetry before any live executor adoption.
- [ ] NE-24 Feed latent plus AST/lexical/graph/domain/ontology features to the
  existing XGBoost ranker.
- [ ] NE-25 Add logistic regression calibration and Naive Bayes lexical
  baselines with separate model receipts.
- [ ] NE-26 Keep SOM 20x20 and TopologyFeature4 as derived routing artifacts,
  not encoder identity or labels.
- [ ] NE-26A Audit MiniCoil, uniCOIL, SPLADE, and bi-encoder candidates for a
  real installed model, tokenizer/vocabulary, sparse output contract, Qdrant
  sparse-vector schema, and executable recall benchmark.
- [ ] NE-26B Add a 384-versus-768 migration benchmark covering dense recall,
  sparse recall, RRF overlap, per-domain metrics, storage cost, and latency.
- [ ] NE-26C Mark truncation modes explicitly as `NONE`,
  `MRL_PREFIX_TRUNCATION`, `LEGACY_DIRECT_SLICE`, or
  `LEARNED_AUTOENCODER`; record query/document roles and post-truncation
  renormalization. Never label an unverified prefix or MRL projection as a
  bi-encoder.
- [ ] NE-26D Benchmark `semantic_768` against `semantic_mrl_512`,
  `semantic_mrl_256`, and `semantic_mrl_128` using the full-768 exact oracle;
  smaller representations may only own admission/shortlisting after measured
  Recall/NDCG parity.

## P1 — ACE and cache projection

- [ ] NE-27 Define ACE pre-fill packet references to canonical evidence,
  latent/model receipts, ontology tuples, and graph feature revisions.
- [ ] NE-28 Populate Valkey centroid/SOM working-set entries only through a
  bounded projection script with dry-run and readback modes.
- [ ] NE-29 Add Qdrant latent projection with canonical identity and revision
  payloads; do not overwrite `semantic_768` points.
- [ ] NE-29A Add Valkey warm `latent_128` and hot `latent_64` namespaces with
  model/source/projection revisions and rebuild-only semantics.
- [ ] NE-30 Add ACE synthesis gate requiring canonicalized top-K evidence,
  confidence, source references, and model/projection revisions.

## P2 — Promotion proof

- [ ] NE-31 Run replay on a frozen daily Graphify snapshot.
- [ ] NE-32 Compare baseline semantic retrieval, latent admission, and fused
  ranking with NDCG/Recall@K and per-domain metrics.
- [ ] NE-33 Prove GPU memory headroom, CPU worker limits, and no silent fallback.
- [ ] NE-34 Produce a promotion receipt or an explicit blocked receipt.
- [ ] NE-35 Adopt the pipeline in the live agentic workflow only after all P0/P1
  gates pass.

## P3 — Tournament training and quantized deployment

These tasks are downstream of the retrieval and replay gates. They create
evaluation artifacts first; they do not authorize online self-training or
automatic model replacement.

- [ ] NE-36 Build a tournament evaluation gym from frozen Graphify snapshots:
  deterministic train/validation/test source-revision splits, domain-stratified
  queries, n-ary ontology/hyperedge labels, and exact semantic/lexical/graph
  relevance references.
- [ ] NE-37 Run best-of-N candidate ranking for the 512-to-96 shortlist:
  exact baseline, low-rank PyTorch sampler, SOM admission, cuVS exact, and
  quarantined CAGRA challenger. Record Recall@K, NDCG, MRR, top-K overlap,
  latency, VRAM, CPU RAM, and fallback state.
- [ ] NE-38 Export only verified tournament winners into QLoRA training tuples;
  every tuple must retain `source_ref`, `packet_key`, `workflow_id`, graph and
  representation revisions, evidence spans, domain, ontology tuples, and
  outcome/reward provenance.
- [ ] NE-39 Train QLoRA adapters offline against the verified tuple export;
  compare base, adapter, and retrieval-only baselines. No adapter may alter
  retrieval identity, Qdrant vectors, PageRank, or canonical Postgres facts.
- [ ] NE-40 Audit model artifacts and quantization names. `GGUF`, `NF4`,
  `INT4`, `RotorQuant`, `TurboQuant`, `isoquant`, and other quantizers must
  record an actual artifact, converter, runtime, checksum, and quality receipt;
  unknown names such as `quanterion` remain `UNRESOLVED`, not promoted.
- [ ] NE-41 Prove CPU/RTX replay parity for FP32 first, then evaluate BF16,
  FP16, INT8, and INT4 only by retrieval quality and memory receipts. Tensor
  Core use is an implementation detail, not a promotion criterion.
- [ ] NE-42 Add a final GAN status receipt distinguishing `CREATED`, `WIRED`,
  `PROVEN`, and `DONE`, with replay, cache, provenance, identity, and
  no-silent-fallback checks.
- [x] NE-43 Complete the file-level wiring inventory above with exact command,
  report path, and owner revision for every lane before adding a new adapter.
- [x] NE-44 Reuse the existing tournament/replay/QLoRA/GGUF owners identified
  above; any proposed replacement must include a supersedes decision and
  migration proof.
- [ ] NE-45 Run the bounded docs acquisition and symbol-index sequence:
  `npm run docs:okf:dev:crawl -- --limit=...` followed by
  `npm run docs:okf:dev:index`; retain raw markdown as evidence and keep
  symbol JSONL/Arrow/IPC outputs rebuildable.

## Acceptance Gates

- [ ] No canonical identity or source data changes during dry-run/training.
- [ ] No projection occurs while model, identity, or parity gates fail.
- [ ] Every latent vector is reproducible from `semantic_768` plus the model
  manifest.
- [ ] ACE receives canonicalized evidence, never raw ANN hits.
- [ ] QLoRA, preference optimization, and RL/bandit training remain blocked
  until NE-31 through NE-38 produce replayable quality evidence.
- [ ] Quantized GGUF or adapter deployment remains blocked until the exact
  FP32 reference and the quantized challenger pass the same held-out suite.
