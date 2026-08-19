# Graph / Retrieval Alignment Tranche — 2026-08-19

This tranche hardens PageRank and graph fanout around the existing Graph Analysis owner. It is additive: existing V1 persisted contracts remain readable; new authoritative paths use versioned V2/V3 contracts. It also reconciles with the pre-existing `GRAPH_SNAPSHOT_PARITY` GPU validation fabric instead of creating a second graph-snapshot or GPU execution owner.

## GRA-0 — owner / executor policy

- [x] Freeze PageRank algorithm family separately from executor and canonical run owner.
- [x] Mark `NEO4J_GDS` canonical-eligible reference executor.
- [x] Mark `CUGRAPH` GPU challenger; static capability remains non-canonical until a projection-qualified Neo4j↔cuGraph parity receipt exists.
- [x] Mark `NETWORKX_REFERENCE` reference oracle.
- [x] Mark dense PyTorch PageRank `REFERENCE_SMALL_GRAPH_ONLY`.
- [x] Mark legacy simulation `NON_AUTHORITATIVE_SIMULATION`.
- [x] Disable the old simulated `compute-neo4j-pagerank.mts --apply` path fail-closed.

## GRA-1 — projection-qualified execution

- [x] Add `GraphProjectionManifestV3`.
- [x] Hash relationship orientation, aggregation, projected property, source property, default value, and property aggregation.
- [x] Add `GraphAnalysisRunV2` with `projectionHash` while preserving V1.
- [x] Add nullable legacy-safe `graph_analysis_runs.projection_hash` Drizzle mapping and additive manual migration; V2 validation, not the database default, requires new qualified runs to carry a hash.
- [x] Add `PageRankExecutionPlanV1` Zod validation.
- [x] Reject relationship types not present in the qualified projection.
- [x] Reject weighted PageRank unless the weight property is projected for every selected relationship type.
- [x] Validate executor-specific damping ranges/capabilities.

## GRA-2 — execution receipts / normalization

- [x] Add executor-specific PageRank telemetry union.
- [x] Add `PageRankExecutionReceiptV1`.
- [x] Add a single-run Neo4j GDS plan executor using `scaler: 'None'`.
- [x] Capture real GDS convergence/timing telemetry.
- [x] Hash the raw sorted PageRank output.
- [x] Add `PageRankAuthorityV2` and batch contract.
- [x] Move L1 normalization to deterministic Atlas post-processing so Neo4j/cuGraph parity compares the same normalization implementation.
- [x] Define `authorityNorm = authorityPercentile` for V2.

## GRA-3 — fanout alignment

- [x] Add `GraphFanoutPlanV1` and `GraphFanoutReceiptV1`.
- [x] Make relationship direction explicit (`OUT | IN | BOTH`).
- [x] Enforce max hops, nodes, edges, neighbors per node, neighbors per relation, candidate budget, and time budget.
- [x] Add deterministic layered Neo4j Cypher BFS executor with stable ordering.
- [x] Keep fanout as candidate expansion evidence, not a fusion/ranking owner.

## GRA-4 — lineage gate

- [x] Add one PageRank lineage validator across projection → plan → GraphAnalysisRunV2 → execution receipt → authority V2.
- [x] Require exact `runId`, algorithm revision, graph revision, projection revision, projection hash, projection name, and executor agreement.
- [x] Add equivalent projection/receipt validation for graph fanout.

## GRA-5 — PPR / GPU promotion gates

### PPR

- [x] Model global vs personalized PageRank distinctly in the plan contract.
- [x] Wire `personalized_pagerank` through the same `pagerank-adapter` dispatcher owner instead of creating a second algorithm path.
- [x] Resolve PPR canonical seeds fail-closed in Neo4j: every requested canonical ID must resolve to exactly one node.
- [x] Pass weighted seed pairs through Neo4j GDS `sourceNodes`.
- [ ] Live Neo4j PPR smoke test and execution receipt proof still required.

### Frozen snapshot / cuGraph

- [x] Discover and preserve the pre-existing `GRAPH_SNAPSHOT_PARITY` owner (`nodes.parquet`, `edges.parquet`, `manifest.json`, NetworkX oracle, cuGraph oracle, validator receipt).
- [x] Record its existing full-corpus PageRank proof: 162,234 nodes / 108,156 edges, top-50 overlap `1.0`, Spearman `1.0`, max L1-normalized delta `4.888482368395049e-9`, receipt `PASS`.
- [x] Rework `GraphProjectionSnapshotV1` into a V3 lineage descriptor over those existing parquet table hashes instead of duplicating the full edge list into a competing JSON snapshot.
- [x] Require NATURAL orientation for the legacy parquet binding; any different projection orientation requires a new export rather than reinterpretation.
- [x] Add `PageRankGpuFabricRequestV1` compiler: `PageRankExecutionPlanV1 + GraphProjectionSnapshotV1 → run_fabric_benchmark.py --mode graph_pagerank_cugraph`.
- [x] Extend the existing single GPU execution owner `scripts/atlas/run_fabric_benchmark.py` with `graph_pagerank_cugraph`; do not create a second standalone PageRank GPU worker.
- [x] GPU worker filters the frozen edge table by selected relationship type, enforces dense ordinals/bounded endpoints, supports weighted/unweighted PageRank, records convergence + V3 snapshot lineage + raw-output hash, and emits `EXECUTED` rather than self-promoting to `PROVEN`.
- [x] Keep GPU PPR blocked: the legacy parquet table does not yet prove a V3 `canonical_id` column, so it cannot safely resolve canonical PPR seeds.

### Canonical GPU promotion

- [x] Add `PageRankCrossExecutorParityReceiptV2` with exact graph/projection/snapshot hashes, both raw-output hashes, top-K overlap, Spearman, L1 delta, percentile delta, and derived PASS/FAIL status.
- [x] Add `PageRankExecutorQualificationV1` statuses: `BLOCKED → MATH_PARITY_PROVEN → PROJECTION_LINEAGE_PROVEN → CANONICAL_ELIGIBLE`.
- [x] Reject boolean proof laundering: canonical qualification requires a typed `NEO4J_GDS ↔ CUGRAPH` V2 parity receipt on the exact V3-qualified snapshot.
- [x] Tests prove the existing NetworkX↔cuGraph PASS cannot by itself make cuGraph canonical.
- [ ] Produce a current V3-qualified parquet snapshot whose node table carries a proven canonical identity bridge suitable for joining Neo4j GDS and cuGraph results.
- [ ] Run Neo4j GDS and cuGraph against that exact frozen snapshot and build a real `PageRankCrossExecutorParityReceiptV2`.
- [ ] Only after that PASS may policy make `CUGRAPH` dynamically canonical-eligible; static capability remains false today.

## GRA-6 — retrieval feature promotion

- [x] Add `GraphRetrievalFeatureEvidenceV1` for revision-qualified graph ranking evidence.
- [x] Route `authorityNorm`, graph distance, and dependency fanout into the existing `[C,25]` `authority_norm`, `graph_distance`, and `dependency_fanout` slots.
- [x] Require graph/projection lineage match and exact packet-key identity before graph values enter the candidate feature matrix.
- [x] Keep PageRank/PPR/fanout out of independent RRF voting in this tranche; the adapter only emits feature columns.
- [x] Preserve matrix width at 25; no speculative graph column was added.
- [ ] Run retrieval ablation before promoting new graph feature policies or changing matrix width.

## Validation state

- [x] Contract tests cover Neo4j/cuGraph plans, weight-property qualification, relationship qualification, PPR/global mismatch, cuGraph damping bounds, legacy simulation rejection, projection-hash sensitivity, fanout projection qualification, cross-contract lineage, Atlas L1 normalization, `[C,25]` graph-feature projection, GPU fabric request compilation, and receipt-based cuGraph qualification.
- [x] Existing Aug-12 `GRAPH_SNAPSHOT_PARITY` runtime receipt proves NetworkX↔cuGraph PageRank/component/Louvain parity on the old frozen artifact; this is retained as historical math/backend evidence, not rewritten as V3 canonical proof.
- [ ] Vitest/tsgo execution of this 2026-08-19 tranche is still required in a checkout with repository dependencies available.
- [ ] Apply/test `graph_analysis_projection_hash_v2.sql` against the live Postgres schema.
- [ ] Live Neo4j global PageRank plan smoke test is still required.
- [ ] Live Neo4j personalized PageRank plan smoke test is still required.
- [ ] Live bounded fanout receipt proof is still required.
- [ ] Live `run_fabric_benchmark.py --mode graph_pagerank_cugraph` execution against a V3-qualified frozen artifact is still required.
- [ ] Neo4j GDS↔cuGraph V2 cross-executor parity receipt is still required before GPU canonical promotion.
