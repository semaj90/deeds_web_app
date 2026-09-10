# Vector Storage Contract — Parent Atlas

**Updated:** 2026-09-10

## Authority boundary

PostgreSQL owns canonical packet/chunk identity, source/workspace revisions,
eligibility, evidence metadata, and the canonical dense semantic representation.
Qdrant, GPU indexes, SOM/centroids, and caches are rebuildable projections.

## Canonical dense representation

```text
representation_id = semantic_768
model family      = EmbeddingGemma
vector dimension  = 768
normalization     = L2
Postgres table    = public.codebase_chunk_index
Postgres column   = content_embedding
physical type     = halfvec(768)
```

The similarly named `content_embedding_768 vector(768)` column is an older
alternate storage surface. It is not the current semantic owner and must not be
chosen simply because it contains `768` in the column name.

The old 384-dimensional lane remains explicit legacy/reference evidence. It is
not the current EmbeddingGemma authority. Optional reduced representations must
carry their own representation ID, projection method, revision, checksum, and
normalization contract.

## Postgres

Current canonical shape:

```sql
-- existing table excerpt; illustrative, not a migration
public.codebase_chunk_index (
  id                  uuid,
  source_ref          text,
  content_hash        text,
  content             text,
  content_embedding   halfvec(768),
  embedding_model     text,
  embedding_dimension integer,
  embedding_version   text,
  encoder_id           text,
  embedding_dtype      text,
  embedding_normalized boolean,
  embedding_created_at timestamptz
)
```

The canonical ANN operator class is `halfvec_cosine_ops`. The existing canonical
HNSW index should be reused; do not create another vector index merely because a
legacy script references `content_embedding_768 vector_cosine_ops`.

## Qdrant

The semantic Qdrant vector is named `content` and has size 768 with cosine
distance. Qdrant point IDs are projection IDs, never packet/chunk identity.

Two 768 collections may be present in this repository/runtime:

```text
codebase_chunks_768
codebase_chunks_768_v2
```

They must be role-qualified in receipts until collection convergence is proven.
Neither collection owns semantic truth; both must reconcile back to exact
Postgres identity/revision and the canonical `content_embedding` owner.

## Embedding executor contract

Shape equality is not representation equality. Every executor must emit or be
bound to immutable provenance sufficient to distinguish:

```text
model / upstream revision
tokenizer revision
input formatter + input-policy revision
quantization/runtime revision
pooling
normalization
vector dimension
input checksum
vector checksum
representation revision
```

Relevant executor families include:

- Ollama `embeddinggemma:latest`
- ONNX Runtime local EmbeddingGemma (DirectML or CPU)
- llama.cpp/GGUF dedicated embedding server

A 768-dimensional result from one executor must not silently overwrite/mix with
a 768-dimensional result from another executor unless the representation-parity
contract admits that equivalence.

## Input length is separate from vector dimension

Do not confuse sequence length with embedding width. The local ONNX artifact at
`models/embeddinggemma_300m_onnx/model_info.json` reports:

```text
embedding_dimension = 768
max_sequence_length = 512
```

That 512 value is an executor/artifact input limit. It does not make the vector
512-dimensional. Each executor must apply its own proven token limit and record
its input policy in representation lineage.

## Reduced representations

Parent Atlas keeps native `semantic_768` as the canonical dense lane. Explicit
reduced/reference representations may include 512, 256, and 128-dimensional
EmbeddingGemma MRL projections, plus independently learned latent representations
such as 256/128/64. They do not replace `semantic_768` and must not gain an extra
RRF vote merely because they use another executor or physical index.

The 384-dimensional corpus is legacy/reference-only unless a specifically named
legacy contract is being evaluated.

## Cache and topology

Valkey/BitFrost may cache vectors/manifests for bounded reuse, but cache entries
are never canonical storage. SOM/KMeans/latent vectors are routing evidence only.
They must preserve the canonical candidate identity and representation revision
that produced them.

## Required promotion chain

```text
admitted workspace/source revision
  -> exact source/chunk identity
  -> canonical EmbeddingGemma semantic_768 input
  -> EmbeddingReceipt/RepresentationManifest
  -> Postgres content_embedding halfvec(768)
  -> exact Qdrant/GPU projection readback
  -> SearchRuntime normalization/fusion
  -> ContextManifest / ACE
```

## Forbidden shortcuts

- Do not fall back from missing canonical vectors to a legacy 384 row.
- Do not use `content_embedding_768` as canonical merely by name.
- Do not use a Qdrant point/vector as Postgres authority.
- Do not invent source/workspace/representation revisions.
- Do not treat 768 dimensions alone as proof that two executor outputs are the
  same representation revision.
- Do not write vectors until the current workspace/source cohort is admitted and
  the writer's authorization contract is satisfied.
