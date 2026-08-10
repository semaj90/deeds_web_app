# Tasks

- [ ] T0 ownership audit completed; no duplicate canonical runtime owner introduced.
- [ ] T1 Postgres artifact/tile migration applied through existing migration owner.
- [ ] T2 one Arrow `feature_matrix_5` artifact created and hash-verified.
- [ ] T2b one Arrow `semantic_768` fixture/artifact created and representation lineage frozen.
- [ ] T2c centroid artifact produced and remains small/hot.
- [ ] T3 Arrow-selected tile → pinned host → GPU exact cosine/top-k parity proven.
- [ ] T4 ACE state transitions proven with deterministic eviction ordering.
- [ ] T5 Valkey/BitFrost revision-qualified metadata keys + invalidation policy proven.
- [ ] T6 cuVS brute-force same-matrix parity proven.
- [ ] T6b CAGRA measured against brute-force; recall and latency recorded.
- [ ] T6c RAPIDS KMeans centroids/labels persisted with artifact lineage.
- [ ] T7 CPU worker staging bounded at four workers and measured.
- [ ] T8 unordered packet/chunk assembly deterministic under shuffled completion.
- [ ] T9 n-ary incidence artifact emitted as sparse membership data, not dense adjacency.
- [ ] T10 visualization consumes derived topology/LOD state only.

## Stop conditions

Stop rather than promote if any of the following is unresolved:

- representation revision ambiguity;
- artifact hash mismatch;
- stale graph/workspace/source revision;
- exact GPU parity failure;
- duplicate semantic vote;
- GPU memory pressure without deterministic demotion;
- n-ary event order confused with DAG execution order.
