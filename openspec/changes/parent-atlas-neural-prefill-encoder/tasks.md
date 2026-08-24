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
| Qdrant semantic/RFF fan-out | 45% | semantic/signature prefetch and RRF path; bounded RFF writer exists | live dry-run is `BLOCKED_DIMENSION_CONTRACT`; error lane is `vector(384)`, signature lane is `halfvec(768)` |
| `latent_128` warm representation | 25% | manifest, adaptive-memory contracts, provisional backfill script | learned post-fan-out encoder and promotion gate |
| `latent_64` hot representation | 30% | vector manifest, simulated Phase 5 bridge, residency tests | trained nested encoder and LibTorch parity |
| LibTorch/RTX inference | 45% | native addon and GPU wrappers exist | model loading, CPU/RTX parity, no-fallback receipt |
| XGBoost ranking/domain head | 55% | trainer, GPU device gate, feature export commands | post-fan-out latent features and live NDCG proof |
| Logistic/NB baselines | 15% | available contracts/capability surfaces | reproducible baseline artifacts and comparison |
| ACE/Valkey/SOM pre-fill | 40% | cache/SOM contracts and packet paths | projection wiring after latent promotion |
| MiniCoil/uniCOIL/SPLADE bi-encoder sparse lane | 10% | discovery terms and sparse adapter surfaces only | model/runtime owner, vocabulary, sparse index, and recall proof |

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
- [ ] NE-23B Add query/candidate representation compatibility checks covering
  native 768, legacy direct-slice 384, learned latent 128/64, and sparse RRF.
- [ ] NE-23C Require the same learned encoder revision and normalization on
  both query and candidate sides before latent cosine comparison.
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
- [ ] NE-26C Mark EmbeddingGemma truncation modes explicitly as `none`,
  `direct_slice`, or `learned_autoencoder`; do not label an unverified prefix
  or MRL projection as a bi-encoder.

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

## Acceptance Gates

- [ ] No canonical identity or source data changes during dry-run/training.
- [ ] No projection occurs while model, identity, or parity gates fail.
- [ ] Every latent vector is reproducible from `semantic_768` plus the model
  manifest.
- [ ] ACE receives canonicalized evidence, never raw ANN hits.
