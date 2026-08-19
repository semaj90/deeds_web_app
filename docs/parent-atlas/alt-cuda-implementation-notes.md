# Parent Atlas ALT / CUDA implementation notes

## Purpose

ALT (A* + Landmarks + Triangle inequality) is the exact-search acceleration path for SGraphV1. It remains part of the single logical `graph` lane. The landmark snapshot is a representation; ALT is an algorithm; CUDA/CUB/cuGraph/Boost/NetworkX are executors; none of those executors receive an extra retrieval vote.

## Exact heuristic

Undirected graph:

```text
h(v,t) = max_l |d(l,t) - d(l,v)|
```

Directed graph uses both the canonical graph and its transpose:

```text
h(v,t) = max_l(
  0,
  d(l,t) - d(l,v),
  d(v,l) - d(t,l)
)
```

Each term is used only when both distances in that triangle-inequality term are finite. Unreachable pairs are skipped and counted in the receipt; they are never silently converted to zero.

## Distance artifacts

Exact-search landmark distances must preserve the lower-bound invariant.

Preferred storage:

- Unweighted graph: `UINT32_HOPS` where practical.
- Non-negative integer/scaled-cost graph: `UINT64_SCALED_COST` when overflow/range requires it.
- Floating weighted graph: authoritative FP32/FP64 according to the distance owner and parity evidence.

Do not use lossy FP16/BF16/INT8 landmark artifacts for an optimality-claiming ALT queue. Quantized or learned distances are challenger features only unless a separate proof establishes conservative lower-bound rounding.

Every artifact is qualified by `graphRevision`, `projectionRevision`, `nodeOrdinalRevision`, `landmarkRevision`, shape, layout, value type, checksum, and producer revision.

## Layout

The mathematical snapshot is `[landmarkCount, nodeCount]` for both forward and, on directed graphs, reverse distances.

`LANDMARK_MAJOR` is the reference artifact layout because a single frontier node evaluates all landmark rows at one node ordinal. A CUDA implementation may materialize or cache another executor-local layout, but that layout must remain a derived artifact with its own revision/checksum.

## CUDA kernel shape

ALT evaluation is not primarily GEMM. For each frontier vertex, the hot operation is:

```text
gather landmark distances
  -> subtract target distances
  -> max with zero / absolute difference
  -> max-reduce over landmarks
  -> h(v,t)
```

For small landmark counts (for example 8/16/32), prototype one warp per frontier vertex. For larger landmark counts or multiple items per lane, use block-level reduction. CUB/CCCL `WarpReduce` / `BlockReduce` are the preferred first implementation primitives rather than hand-rolled shared-memory reduction.

Avoid the CUB non-deterministic block-reduction variant for receipt-producing exact paths. Max over exact integer values is naturally stable, but kernel selection and tie-breaking should still be recorded.

## Frontier ordering

Exact queue authority uses:

```text
f_exact(n) = g(n) + h_ALT(n)
```

An unproven PCA/latent/spectral/GNN/learned score may be used only after `f_exact` as a deterministic tie-breaker or in a separate greedy/beam/shadow queue:

```text
(exactF, aggressiveH, canonicalId)
```

It may not terminate the exact search and may not claim optimality.

## Precompute executor ladder

Reference / parity progression:

```text
NetworkX BFS/Dijkstra-like reference
  -> Boost Graph CPU challenger
  -> cuGraph BFS for unweighted snapshots
  -> cuGraph SSSP for non-negative weighted snapshots
```

The graph projection manifest must prove the projection is compatible with the selected algorithm (directedness, weights, transpose, node ordinals, revision).

## Where GEMM belongs

Use cuBLASLt/LibTorch CUDA for dense derived geometry:

- `semantic_768 -> pca_128`
- `pca_128 -> latent_64` or trained AE layers
- candidate feature matrix scoring
- learned heuristic MLPs
- reranker projections

Do not force ALT landmark max-reduction through GEMM solely to use Tensor Cores.

## Sparse algebra direction

GraphBLAS-style semirings are the longer-term abstraction for sparse graph propagation:

- Boolean/OR-AND style propagation for reachability/BFS-like operations.
- Min-plus style algebra for shortest-path relaxation.
- Ordinary plus-times for numeric sparse propagation.

Treat this as an algorithmic/reference algebra. cuGraph remains the production graph-algorithm executor until an Atlas-specific sparse semiring kernel is proven faster and parity-safe.

## Landmark selection

Landmark selection affects speed, not admissibility, provided the stored graph distances are exact/authoritative.

Candidate strategies may include:

- farthest-point / k-center-style graph-distance spread,
- component-aware spread,
- PageRank/authority extremes,
- spectral extremes,
- PCA/latent cluster medoids.

PCA/SVD/latent selection is allowed to choose *which* landmarks to precompute. It does not make PCA distance itself an admissible A* lower bound.

## Required proof gates before CUDA becomes trusted

1. TypeScript ALT fixture against hand-computed examples.
2. NetworkX reference on frozen SGraph fixtures.
3. Directed graph + transpose parity.
4. Unreachable-node/component cases.
5. UINT32/UINT64 overflow and sentinel checks.
6. Floating-distance tolerance policy where weighted FP is used.
7. CPU vs CUDA heuristic vector parity.
8. CPU vs CUDA final shortest path/cost parity.
9. Deterministic tie-break parity using canonical IDs.
10. Benchmark receipt: frontier size, landmark count, latency, peak VRAM, kernel revision.

No CUDA result becomes canonical truth merely because it is faster.
