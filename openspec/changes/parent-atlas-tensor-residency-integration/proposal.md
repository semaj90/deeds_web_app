# Parent Atlas Tensor Residency Integration

## Intent

Add a revisioned bulk-numeric artifact and tile-residency layer without changing canonical packet identity, graph ownership, or semantic retrieval ownership.

## Scope

- Arrow IPC artifacts and manifests.
- Sparse 4D topology coordinates and deterministic tile keys.
- ACE logical residency state.
- Valkey / BitFrost metadata cache contract.
- CPU staging worker contract.
- GPU tile cache adapter.
- cuVS brute-force/CAGRA and RAPIDS KMeans adapters.
- n-ary incidence artifact contract.
- revision-qualified packet reader / validator / assembler.
- optional protobuf adapter contract.
- visualization-only NES/PS2 LOD glyph contract.

The canonical Atlas vector-selection slice now also sits underneath this integration as a
supporting layer, without changing the existing packet consumer pipeline, packet assembler,
RTX ranker, or tool receipt boundary. It is now wired into the live packet consumer result as an
additive `featureMatrix` field, not as a new owner. The slice adds:

- `src/lib/server/atlas/vector/ace-packet-vector.ts`
- `src/lib/server/atlas/vector/turbovec-interpolation.ts`
- `src/lib/server/atlas/ranking/packet-feature-matrix.ts`

ACE compatibility re-exports remain in place for the same files under `src/lib/server/ace/`.

## Non-goals

- No second RRF owner.
- No second graph-analysis runner.
- No HNSW reimplementation.
- No custom GEMM before profiling.
- No replacement for `semantic_768`.
- No promotion of SOM, topology4, n-ary metrics, or GPU features without held-out evaluation.
