# Embedding lane sweep — 2026-08-20

## Result

The active dense contract is now EmbeddingGemma native `semantic_768`.
EmbeddingGemma MRL-derived representations are limited to `512`, `256`, and
`128` (plus native `768`) and require truncation plus re-normalization.

The legacy `dense_384` lane remains addressable for compatibility but is
`REFERENCE_ONLY`, is removed from active Qdrant priority/hot/warm/cold lists,
and no longer claims to be an EmbeddingGemma projection. `latent_64` is a
separate `768 -> 64` routing autoencoder contract, not an MRL representation.

FastEmbed is documented as an optional ONNX inference toolbox. It is not the
canonical EmbeddingGemma runtime, a vector store, or an ANN index. The current
official FastEmbed Python model list does not list EmbeddingGemma, so no dense
runtime replacement was promoted. Sparse BM25/BM42/SPLADE and reranker use
remain separate benchmark lanes.

Jina Embeddings v2 base-en and base-code expose 768-dimensional vectors, but
they are separate learned spaces and cannot be cosine-compared with
EmbeddingGemma `semantic_768`. They remain experimental ranked-candidate
challengers only.

## Validation

- `npm run atlas:vector-lanes:smoke` — PASS, 6/6 gates.
- Focused canonical representation tests — PASS, 8/8.
- `git diff --check` — PASS; only existing line-ending warnings.
- Standalone `tsc` invocation — NOT A PRODUCT FAILURE; it lacks the repo's
  SvelteKit `$lib` path configuration and should not replace the configured
  SvelteKit check.

## Promotion state

- EmbeddingGemma `semantic_768`: contract updated; existing EMB0–EMB2 proof remains the runtime evidence.
- FastEmbed EmbeddingGemma replacement: NOT PROVEN.
- Jina v2 alternate dense lane: NOT PROVEN.
- SPLADE/miniCOIL sparse owner: NOT PROVEN.
- Ollama, TurboVec, Qdrant HNSW, and pgvector ownership: preserved.
- Runtime/database/vector-store writes: none.
