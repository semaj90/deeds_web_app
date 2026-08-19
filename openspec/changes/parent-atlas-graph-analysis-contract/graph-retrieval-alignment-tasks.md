# Graph / Retrieval Alignment Tranche — 2026-08-19

This tranche hardens PageRank and graph fanout around the existing Graph Analysis owner. Existing V1 persisted contracts remain readable; new authoritative paths use versioned V2/V3 contracts. The implementation reconciles with the pre-existing `GRAPH_SNAPSHOT_PARITY` validation fabric instead of inventing a second graph exporter or GPU execution owner.

## GRA-0 — owner / executor policy

- [x] Freeze PageRank algorithm family separately from executor and canonical run owner.
- [x] Keep `NEO4J_GDS` as canonical/reference executor.
- [x] Keep `CUGRAPH` as GPU challenger; static capability remains non-canonical until an execution-bound V3 PageRank proof passes.
- [x] Keep `NETWORKX_REFERENCE` as reference oracle and dense PyTorch as `REFERENCE_SMALL_GRAPH_ONLY`.
- [x] Mark legacy simulation non-authoritative and disable the old simulated `compute-neo4j-pagerank.mts --apply` path fail-closed.

## GRA-1 — projection-qualified execution

- [x] Add `GraphProjectionManifestV3`.
- [x] Hash relationship orientation, aggregation, projected property, source property, default value, and property aggregation.
- [x] Add `GraphAnalysisRunV2` with `projectionHash` while preserving V1.
- [x] Add nullable legacy-safe `graph_analysis_runs.projection_hash` Drizzle mapping and additive manual migration; V2 validation, not a DB default, requires new qualified runs to carry a hash.
- [x] Add `PageRankExecutionPlanV1` and executor-capability validation.
- [x] Reject relationship types absent from the qualified projection.
- [x] Reject weighted PageRank unless the selected relationship types project the requested weight property.

## GRA-2 — execution receipts / normalization

- [x] Add executor-specific PageRank telemetry and `PageRankExecutionReceiptV1`.
- [x] Add single-run Neo4j GDS plan execution with `scaler: 'None'`, real convergence/timing telemetry, raw-output hashing, and temporary-property cleanup.
- [x] Add `PageRankAuthorityV2` and deterministic Atlas L1 + tie-aware percentile normalization.
- [x] Define `authorityNorm = authorityPercentile` for V2 so backend raw-score scale cannot leak into retrieval.

## GRA-3 — fanout alignment

- [x] Add `GraphFanoutPlanV1` / `GraphFanoutReceiptV1` with explicit `OUT | IN | BOTH` direction.
- [x] Enforce max hops, nodes, edges, per-node/per-relation neighbors, candidate budget, and time budget.
- [x] Add deterministic layered Neo4j Cypher BFS with stable ordering.
- [x] Require explicit canonical/packet/source identity for fanout matching; `stableKey`/generic `id` are metadata only, never canonical fallback.
- [x] Keep fanout as candidate-expansion evidence, not a fusion/ranking owner.

## GRA-4 — lineage gate

- [x] Validate projection → plan → `GraphAnalysisRunV2` → execution receipt → authority V2.
- [x] Require exact run, algorithm, graph, projection, projection-hash, projection-name, and executor agreement.
- [x] Add equivalent projection/receipt validation for graph fanout.

## GRA-5 — PPR / GPU promotion gates

### PPR

- [x] Model global vs personalized PageRank distinctly.
- [x] Route `personalized_pagerank` through the same PageRank adapter owner.
- [x] Resolve Neo4j PPR seeds fail-closed: every requested canonical ID must resolve to exactly one explicit canonical/packet/source identity node.
- [x] Pass weighted GDS `sourceNodes` pairs.
- [x] Remove `stableKey`, generic `id`, and Neo4j internal ID as PageRank canonical fallbacks; score streaming requires full explicit-identity coverage and rejects duplicate identities.
- [ ] Live Neo4j PPR smoke test and receipt proof still required.

### Existing frozen snapshot / historical GPU proof

- [x] Preserve the pre-existing `GRAPH_SNAPSHOT_PARITY` owner (`nodes.parquet`, `edges.parquet`, `manifest.json`, NetworkX oracle, cuGraph oracle, validator receipt).
- [x] Preserve its Aug-12 full-corpus proof as historical backend/math evidence: 162,234 nodes / 108,156 edges, PageRank top-50 overlap `1.0`, Spearman `1.0`, max L1 delta `4.888482368395049e-9`, receipt `PASS`.
- [x] Do **not** reinterpret that legacy PASS as V3 canonical executor qualification because it lacks the new projection/parameter/execution lineage.
- [x] Rework `GraphProjectionSnapshotV1` as a V3 descriptor over the existing immutable parquet table hashes rather than duplicating the edge list.
- [x] Snapshot identity now includes projection revision/name/hash, graph revision, node/edge table hashes, and counts.
- [x] Require NATURAL orientation for the legacy parquet binding; a different orientation requires re-export rather than reinterpretation.

### Parity coordinate — not canonical identity

- [x] Audit the canonical snapshot materializer: `graph_node_key` is deterministic (`tree:${treeNodeId}` or `packet:${packetKey}`) after graph eligibility/provenance checks.
- [x] Use `graph_node_key` strictly as `parityNodeKey` for executor score alignment.
- [x] Explicitly forbid interpreting `parityNodeKey` as packet/symbol canonical identity; retrieval authority promotion still resolves canonical identity separately.
- [x] Update cuGraph worker output to `{ parityNodeKey, nodeOrdinal, score }` and require unique graph-node keys + dense ordinals.

### Same frozen graph for Neo4j GDS and cuGraph

- [x] Use the official GDS Python Client DataFrame construction path instead of reconstructing the reference graph from live Neo4j database state.
- [x] Extend the existing single execution owner `scripts/atlas/run_fabric_benchmark.py`; do not create standalone PageRank GPU/GDS worker scripts.
- [x] Add `graph_pagerank_cugraph`: read exact frozen parquet, filter selected relationship types, enforce dense ordinals/endpoints, run weighted/unweighted cuGraph PageRank, emit raw score artifact + `EXECUTED` receipt.
- [x] Add `graph_pagerank_neo4j_gds`: read the same frozen parquet, construct an in-memory GDS graph from pandas `nodeId/sourceNodeId/targetNodeId/relationshipType` frames, run PageRank `mutate` exactly once, capture `didConverge`/`ranIterations`, stream the temporary mutated property, and drop the in-memory graph in `finally`.
- [x] Keep GDS mutation inside the temporary graph catalog only; do not use PageRank `write` mode or mutate source Neo4j nodes.
- [x] Record GDS client version, GDS server version, Neo4j database, cuGraph version, and cuDF version in execution receipts.
- [x] Require GDS reference convergence before cross-executor proof; reject explicit cuGraph non-convergence.
- [x] Verify current cuGraph 26.06 semantics: `max_iter` is an enforced maximum-iteration parameter and `fail_on_nonconvergence=false` returns `(pagerank, converged)`; the ignored NetworkX-compatibility parameter is `dangling`, not `max_iter`.
- [x] Neither graph mode writes Postgres, source Neo4j graph data, Qdrant, or canonical authority.
- [x] Keep GPU PPR blocked: `graph_node_key` is a parity coordinate, not a canonical PPR seed identity contract.

### Runtime version compatibility

- [x] Audit current Neo4j/GDS compatibility documentation instead of assuming Python-client and server versions map numerically.
- [x] Current `graphdatascience` client 1.22 supports GDS `>=2.6,<2.28` and `<2026.6`; the repo production compose remains `neo4j:5-community`, whose supported modern GDS line is 2.x (Neo4j 5.26 ↔ GDS 2.13 in the current compatibility matrix).
- [x] Treat runtime version strings as receipt evidence; do not infer compatibility from package names alone.
- [ ] Live worker preflight must confirm the installed workstation Python client and server GDS versions are a supported pair before accepting a parity proof.

### Matched fabric requests

- [x] Generalize the request compiler to `PageRankParityFabricRequestV1`.
- [x] Compile `NEO4J_GDS` reference and `CUGRAPH` challenger worker calls from one plan/snapshot.
- [x] Require identical snapshot hash, relationship set, weighted mode, damping, max iterations, and tolerance across the pair.
- [x] Preserve `compilePageRankGpuFabricRequest()` as a challenger-only compatibility API.

### Execution-bound canonical GPU proof

- [x] Rename parity identity from `canonicalId` to truthful `parityNodeKey` and record `parityCoordinate='graph_node_key'`.
- [x] Make `PageRankCrossExecutorParityReceiptV2` parameter-qualified: algorithm revision + normalized parameters + deterministic `parameterHash`.
- [x] Derive top-K overlap, tie-aware Spearman, L1 delta, percentile delta, score-set hashes, and PASS/FAIL from full aligned score sets; callers cannot supply PASS-shaped metrics.
- [x] Add strict `PageRankFabricExecutionReceiptV1` validation against the exact plan/snapshot/backend.
- [x] Add `loadPageRankParityScoreFile()` to hash the actual NDJSON bytes, enforce dense ordinals, and reject duplicate parity keys.
- [x] Add `PageRankCrossExecutorProofV1`: binds both worker execution receipts, both raw score-file hashes, exact parameter hash, exact snapshot hash, derived parity receipt, and a deterministic proof hash.
- [x] Make `PageRankExecutorQualificationV1` require the execution-bound proof envelope; a standalone V2 metric receipt or boolean cannot promote cuGraph.
- [x] Qualification remains `BLOCKED → MATH_PARITY_PROVEN → PROJECTION_LINEAGE_PROVEN → CANONICAL_ELIGIBLE`.
- [x] Add regression tests for legacy-PASS non-promotion, exact-plan proof promotion, changed-parameter proof rejection, and worker/file hash mismatch rejection.

### Runnable parity orchestration

- [x] Add `sveltekit-frontend/scripts/atlas/run-pagerank-cross-executor-parity.mts`.
- [x] Input: one `PageRankExecutionPlanV1`, one `GraphProjectionSnapshotV1`, and the legacy parity receipt.
- [x] Run the shared fabric worker twice (GDS reference and WSL2 RAPIDS cuGraph challenger) from the matched request pair.
- [x] Load/verify both execution receipts and score artifacts, build `PageRankCrossExecutorProofV1`, then build `PageRankExecutorQualificationV1`.
- [x] Write proof + qualification artifacts without mutating runtime executor policy.
- [ ] Run this orchestrator live against a current V3-qualified frozen artifact.
- [ ] Only a real execution-bound PASS may justify a later policy change making cuGraph dynamically canonical-eligible; static capability remains false today.

## GRA-6 — retrieval feature promotion

- [x] Add `GraphRetrievalFeatureEvidenceV1` for revision-qualified graph ranking evidence.
- [x] Route PageRank authority, graph distance, and dependency fanout into the existing `[C,25]` `authority_norm`, `graph_distance`, and `dependency_fanout` slots.
- [x] Require graph/projection lineage match and exact packet-key identity before graph values enter the candidate matrix.
- [x] Keep PageRank/PPR/fanout out of independent RRF voting; they are features/evidence, not new fusion votes.
- [x] Preserve matrix width at 25.
- [ ] Run retrieval ablation before changing graph feature policy or matrix width.

## Validation state

- [x] Contract/unit tests now cover projection qualification, algorithm parameters, PPR/global mismatch, executor capability boundaries, legacy simulation rejection, projection-hash sensitivity, fanout qualification, authority normalization, `[C,25]` graph-feature projection, matched fabric request compilation, execution-bound parity proof, and qualification policy.
- [x] Historical Aug-12 NetworkX↔cuGraph runtime receipt remains valid as backend/math evidence only.
- [x] Current upstream APIs re-verified on 2026-08-19: GDS DataFrame graph construction, PageRank mutate telemetry, graph node-property streaming, graph drop, `server_version()`, Python-client compatibility matrix, and cuGraph 26.06 PageRank iteration/convergence semantics.
- [ ] Vitest/tsgo execution of the 2026-08-19 tranche is still required in a checkout with repository dependencies available; this connector session cannot execute the workstation checkout.
- [ ] Apply/test `graph_analysis_projection_hash_v2.sql` against live Postgres.
- [ ] Live Neo4j global PageRank plan smoke test.
- [ ] Live Neo4j personalized PageRank smoke test.
- [ ] Live bounded fanout receipt proof.
- [ ] Live GDS DataFrame-construction/mutate worker proof, including installed client/server version compatibility.
- [ ] Live cuGraph worker proof on the same V3 snapshot/parameters.
- [ ] Live `PageRankCrossExecutorProofV1` + qualification artifact.
- [ ] Retrieval ablation before any weighting/policy change.
