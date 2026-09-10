# Full-Corpus Embedding Backfill — Compatibility Notice

**Updated:** 2026-09-10

The historical `backfill-codebase-chunk-embeddings.mjs` implementation targeted
`codebase_chunk_index.content_embedding_768 vector(768)`. That surface is no
longer the canonical Parent Atlas semantic owner.

Current contract:

```text
representation_id = semantic_768
dimension         = 768
canonical column  = codebase_chunk_index.content_embedding
physical type     = halfvec(768)
```

The compatibility script now refuses `--apply`. This prevents an old operator
command from recreating split semantic ownership.

Use the stricter revision-qualified writer instead:

```bash
node ../scripts/atlas/backfill-graphify-file-embeddings-768.mjs
```

Run it without `--apply` first. Its apply path requires explicit authorization,
workspace/source revision qualification, immutable embedding runtime provenance,
and exact readback.

`content_embedding_768` remains inspectable as historical/alternate 768 storage.
Do not delete or copy it automatically; reconciliation is a separate migration
gate.

The 384-dimensional lane remains legacy/reference-only. Current EmbeddingGemma
native output is 768 dimensions; supported reduced MRL views are separately
named representations rather than replacements for `semantic_768`.
