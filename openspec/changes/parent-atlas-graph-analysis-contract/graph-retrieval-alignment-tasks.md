# Graph / Retrieval Alignment Tranche — 2026-08-19

This tranche hardens PageRank and graph fanout around the existing Graph Analysis owner. It is additive: existing V1 persisted contracts remain readable; new authoritative paths use versioned V2/V3 contracts.

## GRA-0 — owner / executor policy

- [x] Freeze PageRank algorithm family separately from executor and canonical run owner.
- [x] Mark `NEO4J_GDS` canonical-eligible reference executor.
- [x] Mark `CUGRAPH` GPU challenger, not canonical until parity proof.
- [x] Mark `NETWORKX_REFERENCE` reference oracle.
- [x] Mark dense PyTorch PageRank `REFERENCE_SMALL_GRAPH_ONLY`.
- [x] Mark legacy simulation `NON_AUTHORITATIVE_SIMULATION`.
- [x] Disable the old simulated `compute-neo4j-pagerank.mts --apply` path fail-closed.

## GRA-1 — projection-qualified execution

- [x] Add `GraphProjectionManifestV3`.
- [x] Hash relationship orientation, aggregation, projected property, source property, default value, and property aggregation.
- [x] Add `GraphAnalysisRunV2` with `projectionHash` while preserving V1.
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
- [x] Move L1 normalization to deterministic Atlas post-processing.
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

- [x] Model global vs personalized PageRank distinctly in the plan contract.
- [x] Keep `personalized_pagerank` fail-closed because the existing dispatcher has no live adapter yet.
- [ ] Wire a projection-qualified PPR executor only after a dedicated adapter and receipt test exist.
- [ ] Add cuGraph PageRank executor over the same frozen projection snapshot.
- [ ] Prove Neo4j GDS ↔ cuGraph parity using top-K overlap, rank correlation, percentile agreement, and normalized error before making cuGraph canonical-eligible.

## GRA-6 — retrieval feature promotion

- [ ] Route `authorityNorm`, fanout distance, and dependency fanout into revision-qualified graph feature evidence.
- [ ] Require graph/projection lineage match before those values enter the retrieval candidate feature matrix.
- [ ] Keep PageRank/PPR/fanout from becoming independent RRF votes.
- [ ] Run ablation before changing the existing candidate matrix width.

## Validation state

- [x] Contract tests added for Neo4j/cuGraph plans, weight-property qualification, relationship qualification, PPR/global mismatch, cuGraph damping bounds, legacy simulation rejection, projection-hash sensitivity, fanout projection qualification, and cross-contract lineage.
- [ ] Vitest/tsgo execution is still required in a checkout with repository dependencies available.
- [ ] Live Neo4j smoke test of the new PageRank plan executor is still required.
- [ ] Live bounded fanout receipt proof is still required.
