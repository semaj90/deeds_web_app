# Parent Atlas Repository Analysis

This directory records source-backed architecture reviews. Treat implementation, test, live-service, and production-admission evidence as separate states; documentation is not a runtime receipt or permission to write to a store.

## Retrieval and vector alignment

See [Qdrant, TurboVec, and AST Search Alignment](qdrant-turbovec-alignment.md) for the detailed contract and evidence limits. The short version:

| Area | Intended owner and role | Boundary / current proof limit |
|---|---|---|
| Canonical dense vectors | PostgreSQL `codebase_chunk_index.content_embedding_768`; `semantic_768`, 768 dimensions. | Embedding recipe and source/workspace lineage must be qualified independently. |
| Qdrant semantic mirror | Rebuildable projection; active contract uses `codebase_chunks_768_v2`, named vector `content`, 768-D cosine. | Live Qdrant 1.19.0 in Docker; HTTP `6333`, gRPC `6334` configured/reachable. Snapshot: 52,816 points; three 768-D cosine vectors; no TurboQuant config. This is not full parity with PostgreSQL. |
| Legacy Qdrant mirror | `codebase_chunks_768`; same named 768-D cosine vectors. | GET-only snapshot 2026-10-20: 328,348 points and scalar-int8 quantization (`quantile: 0.99`). Its larger count/config do not make it canonical or prove matching identity. |
| Qdrant tags | The legacy collection exposes fields including `feature_id` and `tags`; v2's observed payload schema is lean and does not list those fields. | Payload fields are filtering/annotation only. Schema-valid or present tags do not establish reviewed taxonomy meaning or source provenance. |
| Taxonomy collections | Live names include `taxonomy_nodes_768`, `topic_clusters`, `document_tags`, and `feature_maps`. | Snapshot counts: 5,527 taxonomy nodes; the latter three are empty. These counts do not prove domain/topic/concept/entity coverage or reviewed ontology links. |
| AST/symbol search | Tree-sitter, AST-grep, Svelte compiler, TypeScript, and LSP produce structural evidence; lexical/FTS and semantic vectors remain separate retrieval lanes. | Spans must map to exact source bytes and revisions. The current Svelte analyzer is diagnostic-only, not a durable evidence writer. |
| TurboVec | Derived MRL prefix ANN index (768-D input, 128-D current index, L2 normalization, 4-bit quantization). | HTTP health snapshot 2026-10-20 reports 274,428 indexed, `source: postgres`, projection `mrl`, representation `embeddinggemma_mrl128_l2_4bit_v1`, and `CHALLENGER_ONLY`. Contract assigns zero independent RRF vote. Health does not prove point-by-point parity or source-revision qualification. |
| TurboVec gRPC | Host `:50062` `Health` RPC succeeds; Python HTTP sidecar `:8791` reports 274,428 indexed, 128-D, 4-bit. | Bridge `Search` delegates to Python `/search`; the `addon(cuda)` health label refers to separate N-API GPU helper calls, not CUDA ANN. Rust TurboVec search is CPU SIMD (AVX2/AVX-512/NEON). No Qdrant/PostgreSQL point parity proven. |
| Qdrant TurboQuant | Qdrant vector quantization; official docs say TurboQuant quantization config is available from v1.18, while the `turbo4` vector datatype is available from v1.19. | The live server reports v1.19.0, but `codebase_chunks_768_v2` currently has no quantization config. Do not enable it on the live collection without a copy-based, held-out recall/latency evaluation and separate write approval. |
| Inference KV quantization | llama-server model/KV-cache settings are a separate inference concern. | Do not conflate them with Qdrant TurboQuant or TurboVec's four-bit ANN encoding. Never persist KV state or tensors in BitFrost/Valkey. |
| AXV2 | Unresolved name in the supplied alignment request. | No verified repository owner, message schema, dimension, or gRPC mapping found; keep it unbound rather than guessing it means TurboVec or a 512-D embedding. |

SearchRuntime is the single cross-lane normalization and fusion owner. Qdrant, TurboVec, and graph/topology outputs must not become duplicate semantic votes. PostgreSQL remains canonical; graph, vector-mirror, and GPU artifacts are projections/executors.

## Source-analysis pipeline

The existing diagnostic path is connected as follows:

```text
audit-indexed-source-batch-v1.mjs
  → audit-indexed-source-providers-v1.mjs
  → exact source/workspace binding and byte verification
  → Tree-sitter/AST-grep OR Svelte compiler + embedded TypeScript
  → LSP and 8095 NLP observations
  → checksummed local diagnostic receipt
```

For Svelte files, `indexed-source-svelte-typescript-v1.mjs` analyzes module and instance script blocks. Svelte/TypeScript parser positions are UTF-16 code-unit offsets; the helper maps them to UTF-8 byte spans in the original file and checks those spans against the bound source bytes. The batch and single-source providers call this helper. Focused fixtures cover Unicode and CRLF as well as exact revision checks.

This proves a diagnostic producer path, not a canonical indexing writer. `DRY_RUN_VALIDATED_NOT_INDEXED` is the correct status until an approved persistence owner stores the observations and an independent database reader proves the same source/workspace revisions, checksums, parser revisions, and byte spans. Do not infer full-corpus coverage, ACE admission, or Qdrant/TurboVec indexing from local receipts.

## Safe alignment order

1. Freeze an admitted source/workspace cohort and verify exact source bytes.
2. Produce AST/symbol facts with parser revisions and original-file UTF-8 byte spans.
3. Join facts to existing canonical chunk and packet identities; keep unresolved joins explicit.
4. Persist only through an authorized existing owner, then independently read back.
5. Evaluate semantic, lexical, and structural retrieval separately; fuse once in SearchRuntime.
6. Build or repair Qdrant/TurboVec projections only from qualified source and embedding evidence, with a separate write authorization.

The `AXV2` name still has no verified repository owner, dimension, representation, or gRPC contract. Do not infer it from an embedding model name or attach it to TurboVec's protobuf.

Qdrant references: [quantization documentation](https://qdrant.tech/documentation/manage-data/quantization/), [vectors and the `turbo4` datatype](https://qdrant.tech/documentation/manage-data/vectors/), and [Qdrant 1.18 release notes](https://qdrant.tech/blog/qdrant-1.18.x/). No collection was created, modified, or reconfigured for this review.

## Related reviews

- [Atlas indexing and source-analysis status](atlas.md)
- [MCP tools and directory analysis](mcp-tools.md)
- [Qdrant, TurboVec, and AST Search Alignment](qdrant-turbovec-alignment.md)
