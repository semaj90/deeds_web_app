# Qdrant, TurboVec, and AST Search Alignment

**Status:** Source-contract review, 2026-10-20. This page describes repository contracts and known proof gaps; it is not a fresh service census or authorization to write to any store.

## Authority and retrieval lanes

PostgreSQL owns canonical chunk/packet identity, source and workspace revisions, eligibility, taxonomy metadata, and canonical `semantic_768` vectors. Qdrant, TurboVec, Neo4j, and GPU/topology artifacts are projections or execution aids. Their point IDs, tags, clusters, and scores do not become canonical identity or admission evidence.

Keep these lanes distinct until SearchRuntime performs fusion:

| Lane | Representation / role | Authority boundary |
|---|---|---|
| Dense semantic | EmbeddingGemma `semantic_768`, 768 dimensions | PostgreSQL `codebase_chunk_index.content_embedding_768` is canonical; Qdrant is a rebuildable mirror. |
| Lexical | PostgreSQL FTS/BM25 and exact terms | Exact identifiers and n-grams complement semantic search; they are not embedding vectors. |
| Structural | Tree-sitter CST/AST, AST-grep, compiler/LSP symbols and references | Findings require source-revision-bound byte spans. Keep separate from dense scores until fusion. |
| TurboVec | MRL prefix, L2-normalized, 128-D or contract-supported 64-D, 4-bit ANN | Challenger/prefilter only; no independent RRF vote (`rrfVoteWeight: 0`). |
| Topology / clusters | Graph, community, K-means, SOM, manifold coordinates | Derived routing/ranking features only; cannot mint identity, taxonomy approval, or an extra retrieval vote. |

## Qdrant collections and payload

The active semantic projection resolves `QDRANT_SEMANTIC_COLLECTION` through `embedding-contract-768.ts`; `qdrant-search.ts` uses the named vector `content` and hydrates the lean `codebase_chunks_768_v2` projection from PostgreSQL. The code also recognizes the legacy `codebase_chunks_768` path. Do not assume aliases imply identical payload layouts or that a local literal is authoritative.

**GET-only live snapshot (2026-10-20):** Qdrant reports version `1.19.0`. The `legal-ai-qdrant` Docker container publishes HTTP `6333` and gRPC `6334`; gRPC is configured and TCP-reachable, but this check did not invoke a Qdrant gRPC method. `codebase_chunks_768_v2` has 52,816 points, three named vectors (`content`, `error`, `signature`), each 768-D cosine, and no collection-level quantization config. Its observed payload schema has `postgres_id`, `source_ref`, `chunk_id`, `content_hash`, representation/model fields, and projection metadata; it does not expose `feature_id` or `tags` in the observed schema. Legacy `codebase_chunks_768` has 328,348 points, the same three vector names/dimensions/metric, scalar-int8 quantization at quantile 0.99, and a wider payload including `feature_id` and `tags`. These are different projections, not evidence of parity. `taxonomy_nodes_768` has 5,527 points; `topic_clusters`, `document_tags`, and `feature_maps` returned zero points in this snapshot. These counts do not establish ontology review or semantic coverage.

The semantic projection contract (`qdrant-semantic-projection.ts`) describes cosine distance, native 768-D representation, and payload fields such as `canonical_id`, `packet_key`, `source_ref`, `representation_id`, `representation_revision`, and optional revision receipts/tags. Actual collection settings and data must be checked against runtime before claiming parity. A `canonical_id` or `packet_key` in Qdrant remains projection data and must join back to PostgreSQL.

Payload tags (`feature_id`, `feature_label`, `domain`, `node_type`, `community`, `kmeans_cluster_id`) are filters or annotations. A syntactically valid tag does not prove taxonomy review, source grounding, or revision qualification. Preserve `UNKNOWN` distinctly from mismatch; never fill missing revisions from a neighboring packet or point payload.

## TurboVec and gRPC alignment

The TurboVec contract declares `embeddinggemma_mrl128_l2_4bit_v1`: a 768-D semantic input, MRL prefix projection to 128 dimensions, L2 normalization, then TurboVec 4-bit quantization. It names HTTP `:8791`, gRPC `:50062`, and `codebase_chunks_768_v2`, while marking the executor `CHALLENGER_PREFILTER_ONLY` with zero RRF weight. The schema's collection field is a contract label; it does not prove TurboVec physically stores or queries the Qdrant collection.

`turbovec-prefilter.ts` uses gRPC only when `TURBOVEC_SIDECAR_GRPC_ENABLED` is enabled and otherwise calls the HTTP sidecar. The gRPC client loads `proto/active/turbovec.proto`; `Search` returns candidate IDs/scores and optional identity copied from the index. Those fields are hints to reconcile, not proof of identity. The proto's 768-D query/upsert messages do not themselves document the server's internal MRL/quantization execution; verify the sidecar implementation and frozen CPU-oracle parity before claiming end-to-end alignment.

The current dense packet search uses Qdrant hit `payload.postgres_id` to resolve chunk rows, then requires qualified `atlas_packet_chunk_lineage` and an exact PostgreSQL packet join-back. It drops unresolved lineage and drift rather than promoting a Qdrant hit. This does not prove full-corpus coverage or admission for every result.

## Quantization boundaries

**Qdrant TurboQuant** is Qdrant's vector quantization feature. Qdrant's official documentation marks quantization config TurboQuant as available from v1.18 and the `turbo4` vector datatype as available from v1.19. The live server reports 1.19.0, but the active `codebase_chunks_768_v2` collection currently has no quantization config; the legacy collection uses scalar int8 instead. Do not enable TurboQuant on the active collection as part of an audit. First evaluate an isolated copy using a frozen query set, exact baseline, tie-aware Recall@K/MRR, latency, and memory receipts; changing collection configuration is a separately authorized write. Qdrant notes that a quantized copy can be stored alongside original vectors, whereas a compact datatype changes how the vector itself is stored; choose deliberately based on whether full-precision rescoring/original retention is required.

**TurboVec's four-bit quantizer** is part of its derived MRL ANN representation (`embeddinggemma_mrl128_l2_4bit_v1`), not Qdrant's TurboQuant. A GET-only TurboVec health probe on 2026-10-20 returned 274,428 indexed, 128 dimensions, 4 bits, source `postgres`, projection `mrl`, and role `CHALLENGER_ONLY`. It also reported seven domain ordinals. Those runtime slots are not proof of a reviewed taxonomy or point-by-point Qdrant/PostgreSQL alignment.

**Inference KV-cache quantization** is another separate concern associated with model serving. Do not equate a llama-server setting with Qdrant's collection quantization or TurboVec's ANN codec. Never persist KV state or tensors in BitFrost/Valkey.

**Live TurboVec RPC distinction (2026-10-20):** `TurboVecService.Health` on `:50062` succeeded with `indexed=274428`, `dim=128`, `bits=4`, and `backend=bridge:py(python)+addon(cuda)`. This composite health label does **not** mean ANN search executes on CUDA: the bridge's `Search` handler calls the Python HTTP sidecar's `/search`; the CUDA N-API addon serves separate GPU helper RPCs such as batch cosine and latent/SOM operations. The active TurboVec proto describes ANN as CPU/SIMD, and the Rust implementation selects AVX2/AVX-512/NEON kernels. TurboVec ANN is not GPU embedding generation. The current Docker listing exposes Qdrant on `6334` but no container port mapping for TurboVec `50062`; the TurboVec health RPC is reachable on the host.

## GraphRAG, enrichment, and prefill

Do not concatenate arbitrary ontology tuples or let Leiden/Louvain communities, Manhattan-distance neighbors, or vector proximity create DAG edges. Treat them as optional, bounded candidate-expansion signals over a frozen cohort. Build structural dependencies from verified source/symbol relations, packet/chunk lineage, and revision-qualified evidence. Retrieve lexical (BM25/FTS), semantic, and structural candidates through existing owners and fuse once in SearchRuntime.

For agentic recommendations or repair: join candidates to exact PostgreSQL identity and source/workspace revisions; assemble typed, checksummed evidence from verified source spans, AST/symbol facts, and reviewed ontology links; leave unresolved tuples unresolved; compile selected evidence into an ACE `ContextManifest` under a measured 4,096-token budget using the active model tokenizer/template; and validate proposed actions independently. BitFrost may cache admitted descriptors/manifests, never hidden reasoning, KV state, or tensors.

SIMT/cuTile, radix sort, bitsets, and compact hash maps are later execution optimizations for measured batch workloads, not fixes for missing identity, revision provenance, taxonomy review, or joins. Prove the CPU oracle and exact readback first, then compare a GPU challenger on the same immutable cohort. Do not enable TurboQuant or build NES LUTs without qualified inputs and held-out retrieval evidence.

Official references: [Qdrant quantization](https://qdrant.tech/documentation/manage-data/quantization/), [Qdrant vector datatypes](https://qdrant.tech/documentation/manage-data/vectors/), [Qdrant 1.18 release notes](https://qdrant.tech/blog/qdrant-1.18.x/).

## AST-aware semantic retrieval

The source-analysis diagnostic pipeline routes `.svelte` through Svelte compiler script extraction and TypeScript parsing for embedded module/instance scripts. Parser/LSP UTF-16 positions are translated to original-source UTF-8 byte offsets; spans must still be checked against exact source bytes and the bound source revision. This diagnostic path is not a durable AST writer and does not by itself admit facts into search or ACE.

Use a staged join, not a merged vocabulary:

1. Exact file bytes and admitted workspace/source binding.
2. Tree-sitter/AST-grep/compiler facts with source-byte spans and parser revisions.
3. Optional grounded NLP/ontology proposals; unresolved concepts and unreviewed feature labels remain proposals.
4. Canonical chunk/packet lineage and PostgreSQL readback.
5. Independent semantic, lexical, and structural candidate lanes, fused once by SearchRuntime.
6. ACE `ContextManifest` only after candidate identity and revision gates pass.

## Gaps and safe checks

- The live check proves Qdrant HTTP metadata and TurboVec `Health` RPC only; it does not prove a Qdrant gRPC method call, TurboVec point-by-point parity, or complete payload parity.
- The source-analysis producer remains diagnostic-only until an approved persistence owner stores facts and independent readback verifies revisions, checksums, parser revisions, and byte spans.
- Feature/domain/concept strings remain separate vocabularies until reviewed mappings exist; do not generate a canonical LUT or classifier from unreviewed tags.
- OpenSpec notes say `axv2` has no verified owner or contract. Treat “AXv2 gRPC alignment” as unresolved; do not bind it to TurboVec proto or ranking layout by guesswork.
- Keep Qdrant/TurboVec writes, taxonomy promotion, and Graphify-dependent ACE admission behind their separate approvals and receipts.

Useful source paths:

- `sveltekit-frontend/src/lib/server/atlas/retrieval/qdrant-semantic-projection.ts`
- `sveltekit-frontend/src/lib/server/search/qdrant-search.ts`
- `sveltekit-frontend/src/lib/server/retrieval/packet-dense-search.ts`
- `sveltekit-frontend/src/lib/server/retrieval/turbovec-prefilter.ts`
- `sveltekit-frontend/src/lib/server/grpc/turbovec-cuda-client.ts`
- `packages/parent-atlas-core/src/schemas/turbovec-contract.ts`
- `proto/active/turbovec.proto`
- `scripts/atlas/audit-indexed-source-providers-v1.mjs`
