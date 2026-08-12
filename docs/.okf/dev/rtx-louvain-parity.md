# RTX Louvain Parity Notes

- schema_version: okf.dev.note.v1
- source_lane: rapids cuGraph + NetworkX + scikit-learn + CuPy
- purpose: record the primary-doc facts used by the frozen graph parity proof
- status: reference only; not authority store

## Docs checked

- cuGraph `from_cudf_edgelist`
  - `edge_attr` names the weight column.
  - `vertices=` must contain the complete vertex population.
  - `renumber=False` is valid when vertex IDs are already dense in `[0, V)`.
  - undirected graphs are symmetrized by default.

- cuGraph `louvain`
  - current stable API accepts `max_level`, `resolution`, and `threshold`.
  - `max_iter` is deprecated; use `max_level` explicitly.
  - the graph must carry connectivity and weights.

- cuGraph `connected_components`
  - returns one component label per vertex.
  - no manual isolated-vertex patch is needed when `vertices=` is supplied.

- NetworkX Louvain
  - supports `weight`, `resolution`, `threshold`, `max_level`, and `seed`.
  - node order can affect output because the algorithm shuffles node consideration.
  - compare partitions with label-invariant agreement metrics, not raw community IDs.

- scikit-learn
  - `adjusted_rand_score` is label-invariant.
  - `normalized_mutual_info_score` is label-invariant and symmetric.

- CuPy timing
  - use CUDA events or `cupyx.profiler.benchmark()` for GPU timing.
  - `time.perf_counter()` alone is host wall time, not GPU kernel time.

## Parent Atlas proof policy

These are repo-level acceptance rules, not claims made by the upstream APIs:

- freeze one undirected projection contract for both backends
- record duplicate / reciprocal edge diagnostics in the receipt
- require exact `gpu_node_id` join before computing ARI / NMI
- keep modularity and partition agreement separate in the receipt
- treat `EXECUTED` as backend success, not parity proof

## Practical consequence

The Louvain parity lane is correct when all of the following hold:

- the frozen projection is weighted on both backends
- the dense-id and vertex-population checks pass
- `duplicateUnorderedPairs == 0` or the projection has been deterministically normalized
- NetworkX and cuGraph produce matching partitions under ARI / NMI
- the receipt records both backend outputs and the projection diagnostics
