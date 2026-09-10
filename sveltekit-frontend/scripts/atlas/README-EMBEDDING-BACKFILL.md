# Embedding Backfill — Current Operator Contract

**Updated:** 2026-09-10

## Canonical representation

EmbeddingGemma produces the Parent Atlas canonical dense representation:

```text
representation_id = semantic_768
dimension         = 768
Postgres owner    = public.codebase_chunk_index.content_embedding
physical type     = halfvec(768)
normalization     = L2
```

`content_embedding_768 vector(768)` is an older alternate storage surface. It is **not** the current canonical owner and must not receive new writes merely because its name contains `768`.

The 384-dimensional lane is legacy/reference-only. Do not truncate canonical EmbeddingGemma output to 384 for current retrieval. Explicit MRL/reference projections must use their own representation IDs and revisions.

## Current writer

Use the revision-qualified root writer:

```bash
node ../scripts/atlas/backfill-graphify-file-embeddings-768.mjs
```

Its default mode is dry-run. Apply requires its explicit authorization and revision/provenance gates.

The historical `sveltekit-frontend/scripts/atlas/backfill-codebase-chunk-embeddings.mjs` entry point is retained only as a compatibility guard. It now refuses `--apply` so old commands cannot recreate a split semantic owner.

## Read-only checks

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE content_embedding IS NOT NULL) AS canonical_semantic_768,
  COUNT(*) FILTER (WHERE content_embedding_768 IS NOT NULL) AS legacy_alternate_768
FROM public.codebase_chunk_index;
```

Verify the physical owner:

```sql
SELECT format_type(a.atttypid, a.atttypmod) AS declared_type
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'codebase_chunk_index'
  AND a.attname = 'content_embedding'
  AND a.attnum > 0
  AND NOT a.attisdropped;
```

Expected:

```text
halfvec(768)
```

## Embedding executors

Different executors may produce the same **dimension** without proving the same **representation revision**.

Current executor families include:

- Ollama `embeddinggemma:latest`
- local ONNX EmbeddingGemma (DirectML / CPU)
- dedicated llama.cpp/GGUF embedding server

Before vectors from different executors are mixed as one representation, record and compare model/tokenizer/input-policy/normalization checksums and a bounded vector-parity fixture. `768 == 768` is necessary but not sufficient for representation identity.

## Local ONNX input limit

The checked-in/local `models/embeddinggemma_300m_onnx/model_info.json` reports:

```text
embedding_dimension = 768
max_sequence_length = 512
```

That 512 value is an **executor artifact input limit**, not a vector dimension. The generic model contract may support a different upstream input length; each executor must enforce its own proven limit rather than confusing token length with embedding dimensionality.

## Qdrant

Qdrant is a derived projection. The semantic vector name is `content` and its size is 768. `codebase_chunks_768` and `codebase_chunks_768_v2` must remain explicitly role-qualified until projection ownership/convergence is proven; neither collection becomes canonical truth.

## Do not do

- Do not write new canonical vectors to `content_embedding_768`.
- Do not reinterpret legacy 384 rows as canonical EmbeddingGemma output.
- Do not copy Qdrant vectors back into Postgres to establish authority.
- Do not treat equal dimensions as proof of equal model/tokenizer/revision lineage.
- Do not backfill while workspace/source revision authority is unresolved.
