# Tasks — Parent Atlas cuGraph Full PageRank Artifact

## CUGRAPH-PAGERANK-SAFETY-01

- [x] Bounded `/v1/graph/pagerank` results persist as `pagerank_cugraph_shadow`, never `pagerank`.
- [x] Run provenance records `selectionMode=TOP_K_SHADOW` and `canonicalMetricEligible=false`.
- [x] Focused unit assertions added.
- [ ] Execute focused Vitest + typecheck on workstation.
- [ ] Live smoke against reviewed resident `:8098` graph; no canonical `pagerank` rows may be created.

## CUGRAPH-PROJECTION-MAP-01

- [x] Define projection-local map checksum over sorted `(projectionOrdinal,nodeKey)` rows.
- [x] Keep `graphOrdinalMapChecksum` unset in the new full-vector artifact unless separately proven.
- [x] Fail closed on non-dense ordinals, duplicate node keys, missing identity, or non-finite scores.
- [ ] Bind `projectionOrdinalMapChecksum` into the live resident graph/load receipt.
- [ ] Prove `gpu_node_id == GraphOrdinal` only through a future explicit bridge; do not infer it from density alone.

## CUGRAPH-PAGERANK-FULL-01

- [x] Add computation-free full-vector artifact writer that accepts the already-computed V-length PageRank dataframe.
- [x] Deterministically sort by projection ordinal before serialization/checksum.
- [x] Artifact columns are exactly `projectionOrdinal,nodeKey,score`; no packet collapse.
- [ ] Wire an explicit `/v1/graph/pagerank/artifact` operation to reuse the existing full-score dataframe/cache without a second GPU kernel.
- [ ] Ensure the HTTP request cannot choose an arbitrary filesystem path; derive destination under the configured artifact root.

## CUGRAPH-PAGERANK-ARROW-01

- [x] Write Arrow IPC file format with `pyarrow.ipc.new_file`.
- [x] Close writer before readback.
- [x] Memory-map readback with `pyarrow.memory_map` + `ipc.open_file`.
- [x] Verify row count, schema, ordinals, node keys, and scores before atomic rename.
- [x] Record artifact/schema/row-payload/parameter/projection-map checksums.
- [x] Add CPU unit fixture for deterministic sorting and Arrow readback.
- [ ] Execute Python unit proof in the RAPIDS/service environment.

## CUGRAPH-PAGERANK-PARITY-01

- [ ] Run NetworkX and cuGraph against the exact same frozen graph projection.
- [ ] Compare by `nodeKey`, not array position or packet collapse.
- [ ] Require exact node-set and revision coverage parity.
- [ ] Record max absolute error, mean absolute error, RMSE, L1 error, Spearman rank correlation, and top-10/25/50 overlap.
- [ ] Do not hard-code a production numeric threshold before observing frozen fixtures.

## CUGRAPH-PAGERANK-POLICY-01

- [ ] Freeze `PageRankParityPolicyV1` from measured fixture distributions.
- [ ] Keep solver tolerance (`tol`) separate from CPU↔GPU promotion tolerance.

## CUGRAPH-PAGERANK-PROMOTE-01

- [ ] Promotion receipt requires `FULL_VECTOR`, rowCount==vertexCount, exact node-set/revision parity, projection-map parity, and numeric policy pass.
- [ ] Only after the promotion receipt may cuGraph materialize the canonical `pagerank` metric name.

## Parallel/non-blocking tracks

- Qdrant semantic projection-ID ownership remains a separate semantic-retrieval blocker and does not block the graph-level full-vector PageRank artifact.
- `GRAPH-ORDINAL-BRIDGE-01` is independent: full CPU/GPU PageRank parity may use `nodeKey` before durable GraphOrdinal equivalence is proven.
- OaK execution work resumes after this graph-safety tranche; GEPA remains downstream of real execution traces.
