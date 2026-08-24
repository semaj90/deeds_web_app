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
        +-- neural encoder: 768 -> 256 -> 128
        +-- optional hot encoder head: 128 -> 64
        +-- CPU reference and LibTorch RTX inference
        v
latent_128 warm cache + latent_64 hot routing
        |
        +-- cuVS/Qdrant candidate rerank/index projection
        +-- Valkey centroid/SOM warm and hot working sets
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

`latent_128` is a candidate working-set representation. It is not an
alternative to the initial `semantic_768` query and must not be produced by
scrolling arbitrary Qdrant points without a fan-out receipt.

## Representation and Bi-Encoder Awareness

Every vector operation must declare both sides of the comparison:

```yaml
query_representation: semantic_768
candidate_representation: semantic_768 | latent_128 | latent_64 | sparse
query_encoder_revision: embeddinggemma-full768-v1
candidate_encoder_revision: embeddinggemma-full768-v1 | atlas-autoencoder-768x128x64-v1
comparison_space: cosine | dot | sparse_rrf
projection_kind: none | direct_slice | learned_autoencoder | sparse_encoder
query_compatible: true | false
```

Compatibility rules:

- `semantic_768` query to `semantic_768` candidate is the canonical dense
  comparison.
- A direct 384 slice is a noncanonical legacy projection and is not silently
  interchangeable with 768.
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
