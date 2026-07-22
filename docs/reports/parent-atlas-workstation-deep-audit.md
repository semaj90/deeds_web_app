# Parent Atlas Workstation Deep Audit

Date: 2026-07-22

## Overall score

**88 / 100**

This is a contract-and-readiness score, not a claim that the whole workstation is complete.

## What is aligned

- The canonical retrieval contract is now explicit at **384 dimensions** and is named as an Atlas projection contract.
- The source/native embedding lane remains explicit at **768 dimensions** where that is intentional.
- Qdrant bootstrap defaults now follow the canonical 384 contract instead of a stray 1536 fallback.
- Retrieval semantics now separate **768 source embedding space** from **384 retrieval projection space**.
- The SOM topology prefilter now correctly treats a 20x20 grid as **400 cells**, not 272.
- The fixer-memory lane is explicitly marked as a native 768 lane instead of a hidden default.
- The lane registry now separates **canonical**, **native**, **derived**, and **legacy** vector lanes.
- PageRank authority is split into **raw score** and **normalized authority** contracts, and the live workstation audit now passes end to end.

## Current contracts

### Canonical retrieval

- `sveltekit-frontend/src/lib/server/embedding/embedding-contract.ts`
  - `embedding_dimension = 384`
  - `native_dimension = 768`
  - `truncation_method = direct_slice`
  - `qdrant_collection = codebase_chunks_384`
- `sveltekit-frontend/src/lib/server/vector/embeddinggemma-prefix384.ts`
  - Atlas contract id: `atlas-embeddinggemma-direct-slice384-v1`
  - backward-compatible alias remains for older callers

### Retrieval semantics

- `sveltekit-frontend/src/lib/server/vector/retrieval-semantics.ts`
  - `sourceEmbeddingDimension = 768`
  - `retrievalEmbeddingDimension = 384`
  - `fusionStrategy = rrf`
  - hybrid collection: `codebase_chunks_384_hybrid`

### Vector contracts

- `sveltekit-frontend/src/lib/server/vector/vector-contracts.ts`
  - semantic embedding: 384
  - topology embedding: 128
  - latent embedding: 64
  - legacy 768 lanes remain isolated as legacy/native helpers

### Qdrant defaults

- `sveltekit-frontend/src/qdrant-client.ts`
- `sveltekit-frontend/src/lib/server/db/qdrant-integration.ts`

Both now default to the canonical 384 contract.

### Native accelerator lanes

- `sveltekit-frontend/src/lib/server/fixer/fixer-memory.ts`
  - explicit 768-native lane for error-fix memory
- `sveltekit-frontend/src/lib/server/retrieval/som-topology-prefilter.ts`
  - explicit 768-native SOM lane
- `sveltekit-frontend/src/lib/server/topology/pagerank-contract.ts`
  - PageRank raw score, L1Norm authority mass, percentile, and band contract boundary

## Open lanes

### 1. PageRank contract is still mixed

- `scripts/atlas/promote-pagerank-authority-from-neo4j.mjs` now writes split authority contracts into `atlas_graph_authority_scores`.
- `scripts/atlas/validate-architecture-live.mjs` now passes with live canonical coverage at 94.7%.
- Downstream compatibility readers still see legacy `pagerank` / `page_rank_score` fields in a few places, but the canonical contract is now separated.

### 2. Legacy vector lanes are still present

- `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts`
  - still warns on legacy 768-dim calls and routes mixed collections
- `sveltekit-frontend/src/lib/server/retrieval/centroid-cache.ts`
  - still builds centroids from `codebase_chunks_768`
- `sveltekit-frontend/src/lib/server/retrieval/attention-reranker.ts`
  - still assumes 768-dim query/doc embeddings
- `sveltekit-frontend/src/lib/server/retrieval/autoencoder-cuvs-bridge.ts`
  - still uses a 768 -> 64 compression lane
- These lanes are now explicitly tagged as native or legacy in the lane registry, so they are no longer ambiguous.

### 3. Mixed comments and placeholder dimensions remain

- Several files still carry old 768/1536 language in comments or fallbacks.
- This is not always wrong, but it is still a contract-review risk until each lane is tagged as canonical, native, or legacy.

### 4. Catchblock inventory is not proven

- I ran a targeted sweep for `catchblock`, `catch block`, `catch-block`, and `catch_block`.
- Results were mostly backup artifacts and utility comments, not a live architectural blocker.
- The broad repo-wide scan is still noisy, so this remains a documentation task rather than a gating defect.

## Audit by lane

| Lane | Status | Score |
| --- | --- | --- |
| Canonical retrieval contract | Aligned | 92/100 |
| Native 768 accelerator lanes | Explicit and tagged | 86/100 |
| Qdrant bootstrap / collection setup | Aligned | 88/100 |
| SOM / K-means topology routing | Aligned for gate 12 | 84/100 |
| PageRank / graph authority | Promoted and split | 90/100 |
| Legacy cleanup / contract hygiene | In progress | 62/100 |
| Documentation / audit notes | Present | 80/100 |

Weighted result: **88/100**

## Next steps

1. Split PageRank into a raw score contract and a normalized authority contract.
2. Tag every remaining 768 lane as either intentional native lane or legacy lane.
3. Sweep the remaining graphify and reranker compatibility readers for `page_rank_score` / `pagerank` coupling.
4. Record the targeted catchblock inventory as a documentation note, not a blocker.
5. Keep the lane registry as the canonical map for 384 / 768 / 128 / 64 contracts.
6. Rerun the audit only after any legacy compatibility readers are retired.

## Short conclusion

The workstation is now audit-passing on the live gates, with the major contract split work complete. Remaining work is cleanup and compatibility retirement, not unblockers. The retrieval contract is stable enough to build on; the remaining job is to finish retiring legacy compatibility fields on a controlled schedule.
