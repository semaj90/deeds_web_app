# Design: Parent Atlas Neural Pre-Fill Encoder

## Pipeline

```text
daily Graphify indexed files
        |
        +-- source identity / revisions
        +-- AST-grep symbols and structural facts
        +-- lexical tokens and keyword classes
        +-- .okf domain / ontology tuples
        +-- PageRank / PPR / SOM / graph features
        +-- canonical semantic_768
        v
Go retrieval / EmbeddingGemma semantic_768 query
        |
        +-- Qdrant semantic_768 + RFF/signature prefetch
        +-- RRF fusion and bounded candidate fan-out
        v
CandidateFeatureMatrixV2
        |
        +-- EmbeddingGemma native MRL: 768 -> 512/256/128
        +-- learned Atlas autoencoder challenger: 768 -> 256 -> 128 -> 64
        +-- CPU reference and optional LibTorch RTX inference
        v
semantic_mrl_* admission/shortlist lanes
        |
        +-- PCA/SVD/Tang-inspired/SOM/AE challenger lanes
        +-- cuVS/Qdrant candidate admission/index projection
        +-- Valkey centroid/SOM working sets
        +-- XGBoost ranker/domain head
        +-- logistic and Naive Bayes baselines
        v
ACE pre-fill packet
        |
        v
bounded multi-hop retrieval and synthesis
```

## Model Contract

```yaml
schema: atlas.neural-encoder-manifest.v1
model_id: atlas-autoencoder-768x128x64-v1
input_representation: semantic_768
input_dimensions: 768
latent_representation: latent_128
latent_dimensions: 128
hot_latent_representation: latent_64
hot_latent_dimensions: 64
decoder_dimensions: 768
dtype: float32
normalization: revisioned_mean_std
training_split: source_revision_grouped
canonical_authority: false
```

The model manifest must include model checksum, training dataset checksum,
normalization checksum, producer revision, source/workspace split policy,
random seeds, PyTorch/LibTorch versions, CUDA device metadata, and evaluation
metrics. A model without these fields remains `TRAINED_UNVERIFIED`.

## NLP Pre-Fill

The pre-fill stage emits derived rows keyed by canonical identity:

```yaml
schema: atlas.neural-prefill-row.v1
canonical_id: string
packet_key: string
source_ref: string
source_revision: string
feature_revision: string
ast_symbols: string[]
keyword_classes: string[]
domain_class: string|null
ontology_tuples:
  - subject: string
    predicate: string
    object: string
    evidence_refs: string[]
topology_features: [number, number, number, number]
semantic_embedding_ref: string
```

AST-grep owns structural extraction. SIMD JSON may parse large manifests or
NDJSON receipts, but it does not parse source code. `.okf` vocabulary entries
must be validated before they are attached to feature rows.

## Ordering Invariant

```text
EmbeddingGemma semantic_768 query
  -> Go retrieval embedding cache
  -> Qdrant semantic/RFF prefetch
  -> RRF/fan-out join by canonical identity
  -> bounded candidate feature matrix
  -> learned latent_128
  -> optional latent_64
  -> Valkey/SOM/cuVS cache or exact rerank
```

`semantic_mrl_512`, `semantic_mrl_256`, and `semantic_mrl_128` are the first
derived admission/shortlist representations because they use EmbeddingGemma's
trained MRL prefixes. `latent_128` and `latent_64` remain learned Atlas
challengers and are not prerequisites for the MRL proof. Neither path may be
produced by scrolling arbitrary Qdrant points without a fan-out receipt.

## Representation and Bi-Encoder Awareness

Every vector operation must declare both sides of the comparison:

```yaml
query_representation: semantic_768
candidate_representation: semantic_768 | semantic_mrl_512 | semantic_mrl_256 | semantic_mrl_128 | latent_128 | latent_64 | sparse
query_encoder_revision: embeddinggemma-full768-v1
candidate_encoder_revision: embeddinggemma-full768-v1 | atlas-autoencoder-768x128x64-v1
query_encoder_role: QUERY
candidate_encoder_role: DOCUMENT
comparison_space: cosine | dot | sparse_rrf
projection_kind: NONE | MRL_PREFIX_TRUNCATION | LEGACY_DIRECT_SLICE | LEARNED_AUTOENCODER | SPARSE_ENCODER
dimensions: 768 | 512 | 256 | 128 | 64 | 384
renormalized: true | false
query_compatible: true | false
```

Compatibility rules:

- `semantic_768` query to `semantic_768` candidate is the canonical dense
  comparison.
- EmbeddingGemma-native MRL representations are leading dimensions of the
  same 768 output and MUST be L2-renormalized after truncation. Supported
  derived representations are `semantic_mrl_512`, `semantic_mrl_256`, and
  `semantic_mrl_128`.
- Every receipt must record `QUERY` versus `DOCUMENT` encoder roles. The same
  model revision with the wrong task role is not automatically compatible.
- A direct 384 slice is `LEGACY_DIRECT_SLICE`, noncanonical, and is not an
  EmbeddingGemma MRL representation.
- `latent_128` or `latent_64` may be compared with a query only when the query
  is passed through the same learned encoder revision and normalization.
- A candidate-only latent projection is valid for cache admission, local
  reranking, or clustering, but not for cross-space cosine search.
- Sparse vectors require a sparse encoder/vocabulary revision and use RRF or a
  sparse metric; they are never padded into dense vectors.

The current registry's `embeddinggemma-full768-v1`/`truncation: none` lane is
the authoritative query contract. The direct 384 slice, simulated metadata
encoder, and provisional latent reducers remain compatibility or diagnostic
lanes until their model and recall receipts exist.

`semantic_768` is the canonical EmbeddingGemma numeric representation. MRL
prefixes are rebuildable admission/shortlist representations and may not
replace the 768 promotion oracle until Recall/NDCG parity is measured. The
384 contract is explicitly `LEGACY_DIRECT_SLICE`, not MRL; FastEmbed or
another 384-dimensional executor may serve legacy routing benchmarks only
after it declares its source encoder, task role, projection metadata, and
noncanonical status. `latent_128` and `latent_64` are independently learned
Atlas representations and must not be labeled `semantic_mrl_128` or any
other model-native MRL representation.

## Candidate shortlist proof

The existing TypeScript `RetrievalCandidateFeatureMatrixV1` is the feature
assembly owner. The first executable low-rank nomination primitive is the
Python `shortlist_candidate_ordinals()` helper. It projects candidate rows and
the query into a bounded SVD basis, returns original `CandidateOrdinal`
values, and emits `atlas.candidate-shortlist-receipt.v1` with checksums and
device metadata. This is a deterministic, Tang-inspired nomination policy;
it is not Tang's sublinear recommendation algorithm and is not yet a live
retrieval stage. Promotion still requires a frozen RRF snapshot,
`candidate_count: 512`, approximately `shortlist_count: 96` nominated
ordinals, full `semantic_768` exact rerank to `final_count: 24`, and
quality/memory receipts.

## Training and Inference Boundaries

- Python/PyTorch owns training, evaluation, and CPU reference inference.
- LibTorch/N-API owns bounded local inference from TypeScript.
- cuGraph/cuVS remain separate WSL2 executors.
- gRPC/protobuf is used for cross-process tensor/receipt exchange; JSON is for
  manifests and diagnostic receipts.
- The existing `phase5-autoencoder-bridge.mjs` and
  `backfill-latent-128.mjs` remain compatibility diagnostics; their provisional
  reducers are not promotion-eligible until replaced by trained inference.

## Ranking Heads

The encoder is not the classifier or ranker. The feature matrix may contain:

```text
latent_128
latent_64
lexical_score
AST overlap
PageRank/PPR
Leiden/SOM categorical or distance features
domain probabilities
ontology overlap
execution utility
historical success
recency
```

XGBoost is the primary nonlinear ranking/domain head. Logistic regression is a
calibration and linear baseline. Naive Bayes is a lexical/count baseline.
Their model IDs, labels, metrics, and feature revisions are separate from the
autoencoder manifest.

## Training lane ownership

The semantic and ranking models have different responsibilities and must not
share an artifact identity:

```text
semantic lane:
  EmbeddingGemma semantic_768              canonical oracle
  Quaterion similarity-learning encoder   challenger only

feature/ranking lane:
  lexical, AST, semantic, graph, domain,
  ontology, SOM, provenance features
       -> CandidateFeatureMatrix
       -> XGBoost LambdaMART / rank:ndcg
```

The existing `learning-trainer.tool.ts` may describe a `quaterion` trainer,
but that is configuration evidence, not proof that the Quaterion package,
weights, corpus, or serving path is installed. A Quaterion experiment must
produce a separate encoder revision, query/document role metadata, training
pair or group checksum, and held-out Recall/NDCG receipt. It must never
overwrite `semantic_768` or write Qdrant projections before promotion.

### Quaterion adapter boundary

The integration is a Python training and serving sidecar, not a TypeScript
dependency and not a replacement for `legal-ai-go-embedding`:

```text
Postgres replay evidence
  -> SimilarityPairSample / SimilarityGroupSample NDJSON
  -> Quaterion TrainableModel + held-out replay
  -> model.save_servable() artifact bundle
  -> quaterion-models inference sidecar
  -> typed embedding receipt
  -> challenger Qdrant collection only after promotion
```

The export contains canonical references and grounded labels only:
`query_id`, `source_ref`, `packet_key`, `candidate_ordinal`, `query_role`,
`document_role`, `label`, `workflow_id`, and revision checksums. Source-revision
grouping prevents a file or generated projection from appearing in both train
and held-out splits.

The inference receipt identifies the challenger separately from the base model:

```yaml
encoder_id: atlas-quaterion-challenger-v1
framework: quaterion-models
base_model_revision: embeddinggemma-full768-v1
query_encoder_role: QUERY
document_encoder_role: DOCUMENT
output_dimensions: 768
normalization: L2
metric: COSINE
artifact_checksum: sha256:...
dataset_checksum: sha256:...
canonical_authority: false
```

Serving may use ONNX or a bounded Python/gRPC adapter, but the wire contract
returns vectors and typed metadata only. It must not expose Python objects,
tensors, or Qdrant client details to TypeScript. The first integration test is
offline encoding and compatibility; Qdrant dual-write and promotion are later
gates.

LambdaMART belongs after candidate generation. Its rows are grouped by a
stable query ID (`qid`) and retain `CandidateOrdinal`; labels are grounded in
replayed evidence, not generated text. The first ranker proof should compare
the existing hand-weighted or exact baseline against XGBoost `rank:ndcg` at
NDCG@10 and NDCG@24, with Recall@K, MRR, top-K overlap, latency, CPU RAM, VRAM,
and fallback state. Logistic regression and Naive Bayes remain separately
reported baselines rather than inputs to a hidden ensemble.

Embedding geometry and training regularization are distinct contracts:

```text
L2_NORMALIZE_VECTOR       embedding/search geometry; recorded per representation
L2_REGULARIZE_WEIGHTS     training policy; implemented here as AdamW weight_decay
```

The existing autoencoder's AdamW `weight_decay` is the training owner. Do not
add a manual embedding L2 penalty or call both concerns simply `l2` in a
receipt. Vector normalization remains part of the query/document
representation compatibility gate.

Quaternion or `manifold4` values may be derived topology/ontology features,
but they are not Quaterion outputs, canonical embeddings, or canonical
identity. They require their own feature revision and evidence contract.

## Tournament and training ladder

The evaluation gym is a frozen, replayable comparison surface rather than an
online learning loop:

```text
Graphify snapshot
  -> revision-safe query/label split
  -> exact semantic/lexical/graph references
  -> candidate tournament
       exact full-set baseline
       PyTorch low-rank nomination
       SOM/centroid admission
       cuVS exact oracle
       CAGRA challenger
  -> quality + latency + memory receipt
  -> verified QLoRA tuple export
  -> offline adapter training
  -> held-out replay
  -> optional quantized/GGUF challenger
```

The tournament ranks retrieval candidates, not arbitrary generated text. A
winning candidate must preserve canonical identity and evidence provenance.
QLoRA tuples are derived only from verified outcomes and must carry source,
workflow, graph, representation, domain, ontology, and reward revisions.

Training and deployment are separate gates:

- PyTorch FP32 is the reference implementation.
- RTX execution is a challenger until replay parity and memory headroom pass.
- BF16/FP16/INT8/INT4 are quality-tested representations, not automatic
  promotions.
- GGUF is an inference artifact format; it does not prove that an adapter,
  ranker, or embedding model is compatible with the retrieval contract.
- `RotorQuant`, `TurboQuant`, and similar names require an identified artifact,
  converter/runtime, checksum, and held-out quality receipt.
- Unknown or misspelled names such as `quanterion` remain unresolved.

GAN validation records four states for every lane:
`CREATED` means the artifact exists, `WIRED` means a live path calls it,
`PROVEN` means replay/tests/receipts confirm behavior, and `DONE` means the
promotion decision is accepted. No model or quantized artifact becomes live
because it merely exists or passes a synthetic smoke test.

## Sparse and Bi-Encoder Migration

The sparse lane is currently mixed and must be versioned rather than renamed in
place:

```text
legacy dense_384 / legacy error vector(384)
  -> retained for compatibility and audit only

EmbeddingGemma semantic_768
  -> separate error_embedding_768 / signature_embedding_768 candidates
  -> Qdrant named sparse/dense projection after recall proof
```

The existing `bm42-sparse.ts` implementation is a hashed lexical challenger,
not a proven BM42, MiniCoil, uniCOIL, or SPLADE encoder. PostgreSQL FTS remains
the canonical sparse baseline. MiniCoil/SPLADE/bi-encoder work may be added as
separate executors only when the model artifact, vocabulary, sparse index
format, and recall receipt are present.

The migration must therefore create revisioned 768-dimensional columns or
named-vector slots alongside legacy 384 columns, backfill with
EmbeddingGemma, compare per-lane recall, and retain the old columns until the
new lane is promoted. No `ALTER COLUMN` or destructive replacement is implied
by this change.

## Graph Isolation Invariant

Embedding dimension failures are retrieval/enrichment failures, not PageRank
or community-algorithm failures. The graph lane has its own input and receipt:

```text
typed Graphify edge snapshot
  -> NetworkX CPU oracle / PPR
  -> Neo4j GDS durable projection
  -> cuGraph RTX challenger
  -> graph feature receipt
  -> join to candidates by canonical_id / CandidateOrdinal
```

The system must report these states separately:

- `GRAPH_ALGORITHM_PROVEN`: PageRank/PPR/community executed on a valid graph
  snapshot.
- `GRAPH_CANDIDATE_JOIN_DEGRADED`: graph scores exist, but semantic/RFF
  candidates could not be joined because the embedding lane is blocked.
- `GRAPH_INPUT_INVALID`: graph snapshot, ordinal map, or typed edge contract is
  invalid.
- `EMBEDDING_DIMENSION_BLOCKED`: semantic/RFF projection cannot run.

The 384-to-768 RFF incident must never invalidate or overwrite an independent
PageRank/community receipt. It may lower candidate enrichment coverage until
the cross-store identity join is repaired.

## Projection and Cache Rules

Only a passing promotion receipt may create derived projections:

- PostgreSQL `latent_128`/`latent_64` rows or packed artifacts
- Qdrant named `latent_128`/`latent_64` vectors
- cuVS CAGRA/IVF-PQ indexes
- Valkey centroid/SOM cache entries
- ACE pre-fill packets

Each projection records `model_id`, `model_revision`, `feature_revision`,
`source_revision`, `projection_revision`, and canonical identity. Cache misses
must be rebuildable and must not alter canonical rows.

## Failure States

- `INPUT_IDENTITY_INCOMPLETE`
- `OKF_SCHEMA_INVALID`
- `PREFILL_EXTRACTION_DEGRADED`
- `MODEL_ARTIFACT_MISSING`
- `MODEL_NOT_REPRODUCIBLE`
- `RECONSTRUCTION_GATE_FAILED`
- `LATENT_RECALL_GATE_FAILED`
- `LIBTORCH_PARITY_FAILED`
- `GPU_EXECUTION_UNPROVEN`
- `PROJECTION_BLOCKED`

Any of these states blocks projection and ACE promotion.
