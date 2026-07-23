# Qdrant Lane Fix Plan

## Current State

The repo is not missing data. The live Qdrant storage is mounted to a persistent volume, so container recreation does not erase collections.

The problem is contract drift:

- `sveltekit-frontend/src/lib/server/embedding/embedding-contract.ts` declares a 384-dim canonical retrieval contract for `codebase_chunks_384`.
- `sveltekit-frontend/src/lib/server/atlas/qdrant-collection-contracts.ts` also hard-codes `codebase_chunks_384_hybrid` as a 384-dim hybrid lane.
- `sveltekit-frontend/src/lib/server/retrieval/search-lanes.ts` still defaults Qdrant to `codebase_chunks_768`.
- `sveltekit-frontend/src/lib/server/atlas/runtime-registry.ts` labels `embeddinggemma-768d` as the canonical retrieval lane.
- `sveltekit-frontend/scripts/smoke/embeddinggemma-smoke.mjs` already supports two explicit lanes:
  - `source768` for native EmbeddingGemma output
  - `retrieval384` for prefix-sliced retrieval projection

## Fix

Use explicit lane IDs instead of one global dimension assumption.

### Canonical lane split

- `dense_384`
  - current hybrid retrieval lane
  - Qdrant collection: `codebase_chunks_384_hybrid`
  - purpose: canonical retrieval

- `dense_768`
  - source / detail lane
  - Qdrant collection: `codebase_chunks_768`
  - purpose: source embedding or detail lookup, not a silent fallback

- `latent_64`
  - derived routing lane
  - purpose: KMeans / SOM / TurboVec / centroid routing only

### Patch order

1. Add or formalize a lane registry that maps `laneId`, `dimension`, `collection`, and `role`.
2. Update all search and projection consumers to read the lane registry instead of hard-coded collection names.
3. Make `embeddinggemma-smoke.mjs` assert the selected lane explicitly.
4. Keep 384 and 768 validation separate; do not broaden the guard to treat them as interchangeable.
5. Leave the live collections in place and build any unified multiview collection side by side.

## Files To Patch

- `sveltekit-frontend/src/lib/server/embedding/embedding-contract.ts`
- `sveltekit-frontend/src/lib/server/atlas/qdrant-collection-contracts.ts`
- `sveltekit-frontend/src/lib/server/retrieval/search-lanes.ts`
- `sveltekit-frontend/src/lib/server/atlas/runtime-registry.ts`
- `sveltekit-frontend/scripts/smoke/embeddinggemma-smoke.mjs`
- `sveltekit-frontend/src/lib/server/retrieval/search-contract.ts`
- `sveltekit-frontend/src/lib/server/atlas/retrieval/go-retrieval-retriever.ts`

## Operational Rule

Do not rebuild the live Qdrant collections just to fix the contract drift. Preserve the mounted storage volume, keep the live collections, and migrate the runtime contracts first.
