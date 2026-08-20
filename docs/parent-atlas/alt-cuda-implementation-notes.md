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

Every artifact is qualified by `graphRevision`, `projectionRevision`, `nodeOrdinalRevision`, `landmarkRevision`, `costModelRevision`, the exact edge-cost checksum, shape, layout, value type, checksum, and producer revision.

The edge-cost checksum is essential: a distance table from `CALLS=1, IMPORTS=2` is not valid for a later search whose cost model changes to `CALLS=2, IMPORTS=1`, even when the graph revision itself has not changed.

## Floating-point admissibility

Do not equate "authoritative float" with "mathematically proven lower bound" automatically.

If every stored distance is independently certified to have absolute error at most `epsilon`, a difference of two stored distances can overestimate its exact triangle term by as much as `2*epsilon`.

For an optimality-claiming queue use:

```text
safe_term = max(0, raw_term - 2*epsilon)
```

and record `numericGuardApplied = 2*epsilon`.

If no certified error bound exists, the floating ALT result may still be used for greedy/beam/shadow guidance, but:

```text
mayTerminateExactSearch = false
mayClaimOptimality = false
admissibility = UNPROVEN_NUMERIC
```

Exact integer hop/scaled-cost artifacts use zero guard.

## Unreachable sentinels

cuGraph-style traversal results may represent unreachable values using the maximum value of the result dtype; floating reference artifacts commonly use positive infinity.

The persisted artifact records the sentinel policy:

```text
UINT_MAX
POSITIVE_INFINITY
```

The accessor normalizes an integer max sentinel to `+Infinity` before ALT arithmetic. Never subtract raw `UINT_MAX` values: doing so can manufacture huge fake lower bounds.

## Byte order and checksums

Persistent ALT V1 artifacts are canonical little-endian byte streams.

```text
byteOrder = LITTLE_ENDIAN
layout    = LANDMARK_MAJOR
```

Checksums cover those exact bytes. In-memory reference buffers may be host-native while the draft branch is being reconciled, but they are not eligible for persistence/promotion until passed through the canonical little-endian materializer.

Use `DataView` or an equivalent explicit-endian codec at the persistent boundary rather than assuming TypedArray byte order/alignment.

## Layout

The mathematical snapshot is `[landmarkCount, nodeCount]` for both forward and, on directed graphs, reverse distances.

`LANDMARK_MAJOR` is the reference persistent layout because a frontier evaluation needs the distance for the same node ordinal from each landmark. A CUDA implementation may materialize/cache a separate executor-local node-major or tiled layout for coalescing, but that layout is a derived artifact with its own revision/checksum and cannot silently replace the canonical snapshot.

## CUDA kernel shape

ALT evaluation is not primarily GEMM. For each frontier vertex, the hot operation is:

```text
gather landmark distances
  -> subtract target distances
  -> max with zero / absolute difference
  -> apply numeric guard when required
  -> max-reduce over landmarks
  -> h(v,t)
```

For small landmark counts (for example 8/16/32), prototype one warp per frontier vertex. For larger landmark counts or multiple items per lane, use block-level reduction. CUB/CCCL `WarpReduce` / `BlockReduce` are the preferred first implementation primitives rather than hand-rolled shared-memory reduction.

Avoid the CUB non-deterministic block-reduction variant for receipt-producing exact paths. Max over exact integer values is naturally stable, but kernel selection and tie-breaking should still be recorded. If later reductions use floating addition or another pseudo-associative operation, distinguish run-to-run reproducibility from cross-GPU reproducibility.

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
TypeScript BFS/Dijkstra fixture
  -> NetworkX BFS/Dijkstra reference
  -> Boost Graph CPU challenger
  -> cuGraph BFS for unweighted snapshots
  -> cuGraph SSSP for non-negative weighted snapshots
```

For directed ALT, run every selected landmark on both:

```text
CANONICAL graph  -> d(landmark, node)
TRANSPOSED graph -> d(node, landmark)
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

Landmark selection affects speed, not admissibility, provided the stored graph distances are exact/authoritative under the same cost model.

Candidate strategies may include:

- farthest-point / k-center-style graph-distance spread,
- component-aware spread,
- PageRank/authority extremes,
- spectral extremes,
- PCA/latent cluster medoids.

PCA/SVD/latent selection is allowed to choose *which* landmarks to precompute. It does not make PCA distance itself an admissible A* lower bound.

The current TypeScript reference uses a deterministic farthest-point strategy with canonical-ID tie breaking and prioritizes currently unreachable regions so disconnected portions of the graph receive landmarks early.

## Snapshot promotion

Persistent ALT snapshot promotion requires all of the following:

1. exact `graphRevision` and `projectionRevision`,
2. exact `costModelRevision` and edge-cost checksum,
3. exact `nodeOrdinalRevision`,
4. explicit little-endian distance artifacts,
5. checksummed forward artifact and, when directed, reverse artifact,
6. no lossy exact-search quantization,
7. exact integer distances **or** certified floating error bound plus numeric guard.

Structural validity alone does not grant exact-search authority.

## Required proof gates before CUDA becomes trusted

1. TypeScript ALT fixture against hand-computed examples.
2. NetworkX reference on frozen SGraph fixtures.
3. Directed graph + transpose parity.
4. Unreachable-node/component cases and sentinel decoding.
5. UINT32/UINT64 overflow checks.
6. Persistent little-endian encode/decode/checksum parity.
7. Floating-distance error-bound policy and `2*epsilon` guard tests.
8. CPU vs CUDA heuristic vector parity.
9. CPU vs CUDA final shortest path/cost parity.
10. Deterministic tie-break parity using canonical IDs.
11. Snapshot cost-model/revision mismatch rejection.
12. Benchmark receipt: frontier size, landmark count, latency, peak VRAM, kernel revision.

No CUDA result becomes canonical truth merely because it is faster.
