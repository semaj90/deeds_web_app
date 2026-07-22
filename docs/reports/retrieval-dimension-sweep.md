# Retrieval Dimension Sweep

Date: 2026-07-21

Scope: active vector and retrieval lanes in `sveltekit-frontend/src/lib/server/vector` and `sveltekit-frontend/src/lib/server/retrieval`, plus the relevant Atlas scripts that still reference explicit vector sizes.

## Summary

The repo is not on a single dimension contract. It currently carries:

- a 384-dim retrieval lane for `codebase_chunks_384_hybrid`
- a 384-dim fallback lane for `codebase_chunks_384`
- a legacy 768-dim lane for TurboVec, Qdrant, and several orchestrators
- auxiliary 64-dim and 128-dim lanes for latent / topology work

`catchblock` did not return any matches in the repo sweep.

## Indexed Results

| File | Dimension / Contract | Note for review |
| --- | --- | --- |
| `sveltekit-frontend/src/lib/server/vector/embeddinggemma-prefix384.ts` | 384 | Declares `embeddinggemma-prefix384-v1`; this is the newer retrieval embedding contract. |
| `sveltekit-frontend/src/lib/server/vector/retrieval-semantics.ts` | 384 + `bm42_sparse` | Explicit contract for `codebase_chunks_384_hybrid` and `codebase_chunks_384`. |
| `sveltekit-frontend/src/lib/server/vector/vector-contracts.ts` | 384 / 128 / 64 / 768 | Mixed contract file. It contains both the canonical 384 lanes and legacy 768 lanes. Review for cross-lane leakage. |
| `sveltekit-frontend/src/lib/server/vector/vector-index-registry.ts` | 384 | Runtime registry points the hybrid and dense retrieval entries at the 384 contract. |
| `sveltekit-frontend/src/lib/server/vector/turbovec-contract.ts` | 768 | TurboVec is still declared as `embeddinggemma:latest` at 768. Do not feed it 384 vectors. |
| `sveltekit-frontend/src/lib/server/vector/embedding-dimension-guard.ts` | 768 | Canonical guard still treats 768 as the canonical lane. This is a legacy contract boundary. |
| `sveltekit-frontend/src/lib/server/vector/PgVectorService.ts` | 768 | Canonical pgvector service still expects 768-dim embeddings. Review against the newer 384 lane. |
| `sveltekit-frontend/src/lib/server/vector/pgvector.ts` | 768 | Same legacy canonical 768 path as above. |
| `sveltekit-frontend/src/lib/server/retrieval/retrieve-candidates.ts` | 384 + `bm42_sparse` | Retrieval path is aligned to the 384 hybrid contract and sparse lane. |
| `sveltekit-frontend/src/lib/server/retrieval/adapters/bm42-sparse-retriever.ts` | `bm42_sparse` | Sparse retriever is now explicit about the sparse vector name. |
| `sveltekit-frontend/src/lib/server/retrieval/adapters/qdrant-bm42-retriever.ts` | `bm42_sparse` | Adapter default now matches the sparse contract. |
| `sveltekit-frontend/src/lib/server/retrieval/soft-routing-orchestrator.ts` | 384 | Dense retrieval path uses `codebase_chunks_384`. |
| `sveltekit-frontend/src/lib/server/retrieval/parallel-orchestrator.ts` | 384 / 768 | Mixed-lane orchestrator. Review for explicit lane selection. |
| `sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts` | 768 | Legacy 768 orchestration remains present. |
| `sveltekit-frontend/src/lib/server/retrieval/go-retrieval-orchestrator.ts` | 768 / 384 | Mixed evidence lane. Review for contract drift. |
| `sveltekit-frontend/src/lib/server/retrieval/go-retrieval-facade.ts` | `embeddinggemma:latest` | Query embedding path still mentions the 768-era model name. |
| `sveltekit-frontend/src/lib/server/retrieval/autoencoder-compression-pipeline.ts` | 768 -> 64 | Explicit compression lane from legacy 768 embeddings to 64-dim latent vectors. |
| `sveltekit-frontend/src/lib/server/retrieval/autoencoder-cuvs-bridge.ts` | 64 | Accelerated search lane over latent vectors. |
| `sveltekit-frontend/src/lib/server/retrieval/discover-clusters.ts` | 64 | Cluster routing over 64-dim encoded space. |
| `sveltekit-frontend/src/lib/server/retrieval/centroid-cache.ts` | 768 | Centroid cache still scrolls `codebase_chunks_768`. |
| `sveltekit-frontend/src/lib/server/retrieval/attention-reranker.ts` | 768 | Attention reranker is still written for 768-dim embeddings. |
| `sveltekit-frontend/src/lib/server/retrieval/som-topology-prefilter.ts` | 768 | SOM prefilter expects 768-dim query embeddings. |
| `sveltekit-frontend/src/lib/server/vector/qdrant-multivector-schema.ts` | 384 | Multivector schema is 384-dim, but the collection name still says `codebase_chunks_768`. Review carefully. |
| `sveltekit-frontend/src/lib/server/retrieval/collection-aliases.ts` | 384 | Alias file explicitly tracks the 384 hybrid and dense collections. |
| `sveltekit-frontend/src/lib/server/retrieval/qdrant-summary-sync.ts` | 384 / 768 | Sync logic handles both collection families. |
| `sveltekit-frontend/src/lib/server/retrieval/rrf-multi-vector.ts` | 768 | Multi-vector RRF lane still documents 768-dim inputs. |
| `sveltekit-frontend/src/lib/server/vector/encoder-provenance-schema.ts` | 64 / 768 | Autoencoder provenance records both the 64-dim latent lane and the original 768-dim source. |
| `scripts/atlas/validate-som-20x20-topology.mjs` | 64 / 768 | Validation comments still mix 768 source vectors and 64-dim latent routing. |

## Review Notes

1. The repo currently has two separate retrieval contracts:
   - 384-dim EmbeddingGemma prefix contract for the Qdrant hybrid lane
   - 768-dim legacy/ TurboVec / pgvector contract for older retrieval and clustering paths

2. The most likely mismatch risk is not a single broken dimension. It is cross-routing:
   - 384 vectors sent into 768-only consumers
   - 768 vectors sent into the 384 hybrid lane
   - comments and defaults still referring to the older lane after code moved forward

3. The sparse lane is now consistent in the active Qdrant path:
   - `bm42_sparse`
   - not `bm25`

4. `catchblock` had no matches in the repo sweep.

## Suggested Follow-Up Review Targets

- `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts`
- `sveltekit-frontend/src/lib/server/vector/vector-contracts.ts`
- `sveltekit-frontend/src/lib/server/vector/turbovec-contract.ts`
- `sveltekit-frontend/src/lib/server/retrieval/parallel-orchestrator.ts`
- `sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts`
- `sveltekit-frontend/src/lib/server/retrieval/go-retrieval-orchestrator.ts`

These are the files most likely to carry stale lane assumptions.

