# Dimension Contract Sweep

Generated: 2026-07-21

Scope:
- `catchblock` sweep
- embedding and retrieval dimension contracts
- TurboVec and Qdrant lane review
- canonical vs derived truncation notes

## Summary

No `catchblock` references were found in `sveltekit-frontend/src`, `scripts/atlas`, or `docs` during the targeted sweep.

The repo does not have one universal vector size. It has distinct lanes:
- canonical native embedding output
- derived retrieval projection
- legacy or transitional vector lanes
- accelerator-specific compression lanes

The mismatch is not "one bad dimension" so much as "several contracts without explicit lane labels." The canonical/dynamic boundary is now the key thing to preserve.

## Live Findings

| File | Dimension / Contract | Notes |
| --- | --- | --- |
| `sveltekit-frontend/src/lib/server/embedding/embedding-contract.ts` | `embedding_dimension: 384`, `native_dimension: 768` | Canonical local contract. Explicit truncation: `direct_slice` from 768 to 384. Marked as the project embedding contract. |
| `sveltekit-frontend/src/lib/server/vector/retrieval-semantics.ts` | `sourceEmbeddingDimension: 768`, `retrievalEmbeddingDimension: 384` | Correctly separates source embedding from derived retrieval projection. `canonical: false` for the retrieval projection. |
| `sveltekit-frontend/src/lib/server/embedding/embedding-persist.ts` | 768 | Persistence lane still expects 768-dim vectors. This is a separate store contract from the 384 retrieval lane. |
| `sveltekit-frontend/src/lib/server/retrieval/retrieve-candidates.ts` | 384 | Retrieval lane expects 384-dim query vectors and uses `codebase_chunks_384_hybrid` / `codebase_chunks_384`. |
| `sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts` | 384 | Operational search runtime also treats 384 as the canonical retrieval dimension. |
| `sveltekit-frontend/src/lib/server/retrieval/parallel-orchestrator.ts` | 768 query, 384 TurboVec lane | Mixed lane file. Qdrant lane is 768, TurboVec lane is 384. This is deliberate but must stay contract-bound. |
| `sveltekit-frontend/src/lib/server/retrieval/embedding-service.ts` | 384 GPU / 768 Qdrant | Explicit model-selection split. This is acceptable only if the caller knows which lane it is invoking. |
| `sveltekit-frontend/src/lib/server/fixer/fixer-memory.ts` | 768 | Intentional native-embedding lane for error-fix memory recall. Renamed constant now makes the lane explicit. |
| `sveltekit-frontend/src/qdrant-client.ts` | `CANONICAL_EMBEDDING_DIM` | Fixed to read the canonical embedding contract instead of guessing `1536`. |
| `sveltekit-frontend/src/lib/server/db/qdrant-integration.ts` | `CANONICAL_EMBEDDING_DIM` | Generic Qdrant collection bootstrap now follows the canonical embedding contract. |
| `sveltekit-frontend/src/lib/server/retrieval/soft-routing-orchestrator.ts` | 384 | TurboVec prefilter lane expects 384-dim dense vectors. |
| `sveltekit-frontend/src/lib/server/retrieval/autoencoder-cuvs-bridge.ts` | 768 -> 64 | Compression lane, not a retrieval canonical. |
| `sveltekit-frontend/src/lib/server/retrieval/centroid-cache.ts` | 768 | Legacy centroid lane over 768-dim vectors. |
| `scripts/atlas/audit-embedding-dimensions.mjs` | 768 / 384 sweep | Existing audit already flags collection-name and vector-size mismatches. |

## Interpretation

1. `embeddinggemma:latest` is still represented in the repo as a 768-dim native output in some lanes.
2. The retrieval contract now correctly introduces a 384-dim derived projection.
3. The 384 lane is not canonical truth for the model, but it is canonical for the retrieval contract.
4. The repo still contains older or transitional 768/1536 assumptions that should be treated as legacy unless they are explicitly tied to a named contract.

## What This Means For The Question

The suspected problem is not "TurboVec dimension is 15** so everything is broken."

The real problem is:
- some lanes use 768 native embeddings,
- some lanes use 384 derived retrieval embeddings,
- some legacy code still defaults to 1536 without the contract being obvious,
- and a few files mix those lanes without a named contract boundary.

That is why truncation must be recorded as a derived projection, not silently inferred.

## Review Notes

- Do not write 768 vectors into 384 collections.
- Do not write 384 vectors into 768 canonical stores unless the write path explicitly performs and labels a projection.
- Do not treat the retrieval projection as canonical model output.
- Keep `canonical: true` only on the native model contract.
- Keep `canonical: false` on any truncation or projection lane.

## Actionable Follow-Up

1. Keep the 768 native embedding lane and 384 retrieval lane separate by contract name.
2. Use the derived projection only where the file explicitly declares truncation.
3. Treat remaining 768-lane helpers as intentional legacy or accelerator lanes until they are explicitly migrated.
4. Continue graph work independently; PageRank does not resolve vector-dimension drift.
