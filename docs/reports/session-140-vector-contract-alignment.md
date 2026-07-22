# Session 140 Vector Contract Alignment

## Verified

The live source tree contains a dedicated vector contract layer at `sveltekit-frontend/src/lib/server/vector/`.

`embeddinggemma-prefix384.ts` defines `embeddinggemma-prefix384-v1` with a 384-dimensional, L2-normalized, cosine contract.

`vector-contracts.ts` defines explicit named vector spaces and validation helpers, including a 384-dimensional semantic embedding lane, a 128-dimensional topology lane, a 64-dimensional latent lane, and a sparse `bm42_sparse` lane.

`scripts/atlas/init-vector-index-registry.mts` exists and initializes four canonical index rows:

- `qdrant_codebase_chunks_384`
- `turbovec_quantized_4bit`
- `kmeans_k32`
- `som_20x20`

`ace-materializer.ts` still materializes ACE packets to Qdrant/Redis/TurboVec mirrors using a 768-dimensional legacy collection path.

`mutation-gate.ts` still treats SOM as a 64-dimensional routing feature and keeps policy selection separate from retrieval.

## In Progress

The target design in the pasted note is directionally aligned with the live code, but the naming is not yet fully unified.

The live code uses `semantic_embedding` / `topology_embedding` / `latent_embedding`, while the proposed architecture refers to `content_384` / `title_384` / `routing_64`.

Those may be equivalent lanes, but that equivalence is not yet proven in the live contract layer.

## Deferred / Not Proven

I did not prove live population of `vector_index_registry`.

I did not prove Qdrant vs TurboVec vs brute-force parity metrics.

I did not prove a live runtime path that uses the 384-dim contract end-to-end instead of the legacy 768-dim path.

I did not prove that routing cache, SOM, and K-means are isolated from tokenizer/token-ID space beyond the contract files inspected.

## Next To-Do

1. Confirm whether `vector_index_registry` is populated in the live database or only initialized by script.
2. Unify the naming contract between the live vector modules and the proposed `content_384` / `routing_64` scheme.
3. Add or inspect parity proofs for Qdrant, TurboVec, and brute-force reference search.
4. Keep tokenizer IDs separate from retrieval vectors and treat SOM/K-means as routing only.

## Status

IMPLEMENTED
- vector contract file exists
- 384 prefix contract exists
- vector registry initializer exists
- legacy 768 materializer remains present

PROVEN
- contract naming and dimensionality are explicit in source
- BM42 sparse lane is declared
- SOM/K-means are represented as routing/clustering concepts

EXPECTED GAPS
- vector registry population proof
- parity benchmark proof
- runtime migration from 768 legacy path to 384 contract path

UNRESOLVED
- whether the proposed naming and the live naming are already mapped one-to-one
- whether the registry initializer has been applied in the live DB

UNSAFE CONSTRAINTS
- conflating contract definition with live population
- treating legacy 768 materialization as proof of the 384 lane

NOT YET PROVEN
- end-to-end vector registry completion
- TurboVec parity
- full retrieval routing split as described in the target architecture

NEXT SAFE ACTION
- inspect the registry table population and patch the naming bridge, not the retrieval semantics.
