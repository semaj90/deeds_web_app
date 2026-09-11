# Tasks — Parent Atlas Graph Validation Fabric

## GRAPH_SNAPSHOT_PARITY — CLOSED 2026-08-12

- [x] Frozen snapshot exporter (`nodes.parquet`/`edges.parquet`/`manifest.json`) —
      `sveltekit-frontend/scripts/atlas/export-graph-snapshot-parity-parquet.mts`. Large-file path
      uses DuckDB's native JSON reader (never Node `JSON.parse` on the 486MB corpus).
- [x] NetworkX CPU oracle + direct cuGraph GPU oracle, both with matching `--scores-out`/
      `--louvain-out` NDJSON contracts — `python/graph_snapshot_parity_networkx_oracle.py`,
      `python/graph_snapshot_parity_cugraph_oracle.py`.
- [x] `atlas-rapids-cu13` WSL2 RAPIDS env repaired (cuBLAS/nvidia-cublas version-skew bug, single
      targeted `pip install --force-reinstall --no-deps nvidia-cublas` fix). No new env needed.
- [x] Real cross-backend PageRank parity on full 162,234-node/108,156-edge corpus: top-50 overlap
      1.0, Spearman 1.0, max delta 4.9e-9.
- [x] Real cross-backend Louvain parity: exact `gpu_node_id` join (0 missing/duplicate both
      sides), ARI=1.0, NMI=1.0, community counts exact match, modularity to 10 decimals.
- [x] 5 real bugs fixed in the cuGraph oracle before trusting the Louvain result (unweighted-graph
      bug, deprecated `max_iter`, insufficient dense-ID proof, isolated-node double-count risk,
      oracle self-reported `PROVEN`→`EXECUTED` governance fix — only the joining orchestrator may
      claim cross-backend parity).
- [x] Receipt: `sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json`, `status: PASS`.
- [x] Environment + file-relationship map: `sveltekit-frontend/docs/reports/graph-snapshot-parity/ENVIRONMENT-AND-FILE-MAP.md`.
- Commits: `647627d7a8` (parity close), plus supporting commits earlier same session.

**STOP boundary respected**: did not broaden into Leiden/HITS/BFS/SSSP, workstation compute
policy, RMM pooling, or ablation studies — those remain open per this proposal's own build order,
items 12+.

### Regression found + fixed, gate reproduced — 2026-08-23

Attempted to reproduce this closed gate against the live-confirmed WSL2
`atlas-rapids-cu13` environment. Found a real regression introduced after
2026-08-12 (the committed `receipt.json` predates the `edgeProjectionDiagnostics`
field): `buildGraphSnapshotParityReceipt()` in
`sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-parity-contract.ts`
spread its full `input` — including `edgeProjectionDiagnostics`, used only
for status derivation — into a `.strict()` Zod parse whose top-level receipt
schema doesn't declare that field (only nested under `networkx`/`cugraph`).
Both oracles had already completed real PageRank+Louvain compute over all
162,234 nodes before the crash; the bug only discarded the receipt object.
Fixed by destructuring the field out before the spread (commit `8fa9443a89`).
Re-run reproduced the closed gate's numbers exactly: `status: PASS`,
`pagerankTopKOverlap/Correlation: 1`, `pagerankMaxDelta≈4.89e-9`,
Louvain `ARI/NMI: 1.0`, componentCount/community-count exact match `54078`.
Did not overwrite the committed `receipt.json` with the new run — that
decision (promote as canonical vs. treat as a regression-test artifact) is
still open. See `parent-atlas-workstation-todo.md` for the full account.

## Still open (not started this session)

- [ ] `graph_pagerank_nx_cugraph` mode (NetworkX-API dispatch to cuGraph backend) — proposal
      distinguishes this from direct cuGraph as a *compatibility dispatch validation*, not the
      runtime owner. Not implemented; direct cuGraph is proven, nx_cugraph dispatch is not.
- [ ] Leiden, HITS, BFS, SSSP parity modes.
- [ ] `GraphGpuContext`-reused-across-algorithms architecture exists in the cuGraph oracle
      (builds directed+undirected graph once, reuses for PageRank/components/Louvain) but does
      NOT yet expose per-stage benchmark receipts (parquet_read_ms/graph_build_ms/kernel_ms are
      computed and returned in the raw oracle JSON, but nothing persists/aggregates them yet).
- [ ] `ATLAS_COMPUTE_POLICY_V1` workstation scheduling (one heavy-compute-family at a time) — not
      implemented.
- [ ] Ablation studies (does PageRank/Louvain/AST/process/SOM actually improve retrieval) — none
      run.
- [ ] Registering `GRAPH_SNAPSHOT_PARITY`, the cuGraph oracle, and the two cuVS audit findings
      (see `ace-hyperrag-chr97-graphify-audit` change) in
      `docs/architecture/runtime-ownership-registry.json` — not done.

## Core graph lane recheck (2026-09-10)

- [x] Re-ran `npm run atlas:graph-snapshot-parity:validate` read-only.
- [ ] Keep graph parity blocked: the validator observed the placeholder
      manifest `graph-revision-placeholder` with `0` nodes and `0` edges and
      returned `BLOCKED`; a frozen manifest must be supplied before NetworkX,
      cuGraph, PageRank, or community parity can be promoted.

## GPU results are a validation benchmark, not canonical graph authority

Per this proposal's own hard rule: these results do NOT get promoted into canonical graph
persistence (`atlas_graph_authority_scores`, `page_rank_score` writes, etc.) until the separate
identity gates (GS1_12, semantic vector ownership exceptions, `SOURCE_REVISION_INDEX_SAFETY_PROVEN`)
close. That work is tracked elsewhere (`parent-atlas-workstation-todo.md`), not in this change.
- [x] **Canonical publication preflight recheck (2026-09-10):** the canonical
  graph artifact is present and 5/6 preflight checks pass. The remaining
  `candidateValidationHookPresent` check is absent, so status remains
  `PUBLICATION_PREFLIGHT_BLOCKED`; no graph publication or database write was
  performed. Receipt: `docs/reports/graphify-atomic-publication-preflight-v1.json`.
## CODEBASE-GRAPH-CANONICAL-PUBLICATION-01 — owner correction (2026-09-10)

- [x] Correct the read-only preflight to inspect the actual canonical graph
  writer, `sveltekit-frontend/scripts/index-codebase-fast.mjs`, rather than
  the downstream consumer chain.
- [x] Re-run the preflight: all 6 publication-safety checks pass, including
  run-scoped temporary output, validation before replacement, atomic rename,
  and no progressive write to the canonical path.
- [x] Keep status `PUBLICATION_PREFLIGHT_READY_CANDIDATE_ONLY`; this proves
  writer safety only, not a current snapshot-bound publication.
- [ ] Require a sealed snapshot-bound candidate receipt and independent
  readback before canonical graph promotion.

Evidence: `docs/reports/graphify-atomic-publication-preflight-v1.json`.
Status: `PARTIAL_PROVEN`; authority=false; writesPerformed=false.
First blocker: `SEALED_SNAPSHOT_BINDING_NOT_PROVEN`.
Next gate: `GRAPHIFY-SNAPSHOT-BINDING-01`.
## CANONICAL-NODE-ORDINAL-MAP-01 (2026-09-10) — candidate only

- [x] Independently validate the existing ordinal map: 4,951 rows,
  4,951 unique dense ordinals, zero missing ordinals, zero duplicate ordinals,
  valid source receipt/checksum, and matching map/receipt checksums.
- [x] Preserve the result as `CANDIDATE_ORDINAL_ADMISSION_READY` only.
- [x] Keep `downstreamAllowed=false` and `canonicalAuthority=false`; the map
  uses `corpus-snapshot:workspace-active-v1:v1`, not the currently admitted
  workspace snapshot, and therefore cannot seal the production graph universe.
- [ ] Rebuild or bind a repository-qualified ordinal map to the admitted
  `WorkspaceSnapshotV1` after current source and structural lineage pass.

Evidence: `docs/reports/candidate-ordinal-admission-v1.json`.
Status: `PARTIAL_PROVEN`; first blocker: `ORDINAL_MAP_CURRENT_WORKSPACE_UNPROVEN`.
Next gate: `GRAPH-PROJECTION-MANIFEST-01` after snapshot-bound lineage.
## CURRENT-GRAPH-ARTIFACT-READINESS-01 (2026-09-10)

- [x] Run the independent graph-artifact readiness audit.
- [x] Confirm the bounded observation plan has 16 observations, 16 unique
  graph-node keys, and 7 packet keys.
- [x] Confirm zero explicit revision-qualified edges are present.
- [x] Reject reuse of the relationship graph revision because its workspace
  revision differs from the current observation plan.
- [x] Preserve all graph stores as non-authoritative with zero writes.
- [ ] Produce a read-only plan for revision-qualified edge materialization
  from admitted structural observations.

Evidence: `docs/reports/current-graph-artifact-readiness-v1.json`.
Status: `CURRENT_GRAPH_ARTIFACT_BLOCKED_ON_EDGE_PRODUCER`; first blocker:
`REVISION_QUALIFIED_EDGE_ARTIFACT_NOT_PROVEN`.
Next gate: `CURRENT_REVISION_QUALIFIED_EDGE_MATERIALIZATION_READ_ONLY_PLAN`.

## GRAPH-CANDIDATE-ORDINAL-ROUNDTRIP-01 (2026-09-10)

- [x] Replayed the bounded graph candidate ordinal roundtrip audit.
- [x] Confirmed `23/23` graph nodes bind to candidate ordinals with zero
      unbound nodes, zero workspace mismatches, and no conflicting packet
      ordinals in the bounded fixture.
- [ ] Keep ordinal admission non-authoritative: the receipt is tied to the
      lineage-qualified 15-candidate fixture and its workspace revision does
      not equal the currently admitted multi-repository snapshot.

Evidence: `docs/reports/current-graph-candidate-ordinal-roundtrip-v1.json`.
Status: `GRAPH_CANDIDATE_ORDINAL_ROUNDTRIP_PROVEN_BOUNDED`; authority=false;
writesPerformed=false. First blocker: `ORDINAL_MAP_CURRENT_WORKSPACE_UNPROVEN`.
Next gate: repository-qualified current-source lineage.
### GRAPH-SNAPSHOT-PARITY-01 command and readiness recheck (2026-09-10)

- [x] Corrected the invocation context: the parity validator is owned by the
      frontend package, so the root package command is stale; the valid
      read-only invocation is `npm --prefix sveltekit-frontend run
      atlas:graph-snapshot-parity:validate`.
- [x] Re-ran the validator. It returned `BLOCKED` against the placeholder
      manifest with `0` nodes, `0` edges, and both backends skipped.
- [ ] Keep graph parity and projection promotion blocked until a real,
      snapshot-bound manifest is supplied; no graph or database writes occurred.

Evidence: `sveltekit-frontend/scripts/atlas/validate-graph-snapshot-parity.mts`
and its generated parity receipt.
Status: `BLOCKED`; authority=false; writesPerformed=false.
First blocker: `GRAPH_MANIFEST_REAL_SNAPSHOT_NOT_SUPPLIED`.
Next gate: current snapshot-bound Graphify execution and graph publication.

## CORE-LANE-RECHECK-2026-09-10

- [x] Re-ran current graph artifact readiness: 16 observations and 0 explicit revision-qualified edges.
- [ ] Keep graph manifest and ordinal sealing blocked until the admitted execution supplies the current graph snapshot.

Evidence: `docs/reports/current-graph-artifact-readiness-v1.json`.
First blocker remains: `GRAPH_MANIFEST_REAL_SNAPSHOT_NOT_SUPPLIED`.

## LEIDEN-READINESS-RECHECK-2026-09-10

- [x] Attempted the read-only Leiden resolution/determinism diagnostic against
      the current structural graph fixture.
- [x] The diagnostic stopped before computation because the execution
      environment does not provide the required `cudf` module.
- [ ] Keep Leiden/graph authority blocked; no community assignment,
      projection write, or path-based identity fallback is admissible.

Evidence: `scripts/atlas/leiden_diagnostic_receipt_v1.py`,
`docs/reports/current-structural-graph-artifact-v2/nodes.parquet`, and
`docs/reports/current-structural-graph-artifact-v2/edges.parquet`.
Status: `LEIDEN_DIAGNOSTIC_INFRASTRUCTURE_BLOCKED`; authority=false;
writesPerformed=false.
First blocker: `LEIDEN_CUDF_RUNTIME_UNAVAILABLE`.
Next gate: graph manifest/ordinal sealing and a reachable, versioned Leiden
diagnostic environment.

## LEIDEN-WSL-RUNTIME-RECHECK-2026-09-10

- [x] Re-ran the read-only Leiden diagnostic in the WSL2
      `atlas-rapids-cu13` environment rather than the Windows Python runtime.
- [x] Confirmed imports for cuDF `26.06.01`, cuGraph/cuVS/cuML `26.06.00`,
      and Torch `2.13.0+cu130`.
- [x] Fixture diagnostic completed with deterministic repeated assignments and
      GPU-vs-GPU ARI `1.0` for the tested 500-node graph.
- [ ] Do not promote Leiden: the input is still a bounded fixture and has no
      sealed current graph manifest, canonical ordinal map, or exact
      cross-store identity readback.

Evidence: `scripts/atlas/leiden_diagnostic_receipt_v1.py` and
`docs/reports/leiden-diagnostic-receipt-v1.json`.
Status: `LEIDEN_FIXTURE_RUNTIME_PROVEN`; authority=false;
writesPerformed=false.
First blocker: `GRAPH_MANIFEST_AND_CURRENT_IDENTITY_UNPROVEN`.
Next gate: current source/structural lineage, then graph manifest and ordinal
sealing before any production Leiden projection.

### GRAPH-ARTIFACT-EDGE-PRODUCER-RECHECK — 2026-09-10

- [x] Re-ran the current graph artifact readiness audit.
- [x] Confirmed `16` observed graph nodes but `0` explicit
      revision-qualified edges.
- [ ] Keep graph publication, ordinal sealing, and derived algorithm
      promotion blocked until the snapshot-native Graphify execution supplies
      a current edge producer and manifest.

Evidence: `docs/reports/current-graph-artifact-readiness-v1.json`.
Status: `CURRENT_GRAPH_ARTIFACT_BLOCKED_ON_EDGE_PRODUCER`; no graph or
database writes were performed.

## ORDINAL-MAP-CANDIDATE-RECHECK-2026-09-10

- [x] Ran the read-only candidate ordinal admission audit; `4,951` candidate
      rows are structurally ready for consideration.
- [ ] Keep ordinal authority unsealed: candidate readiness is not a current
      graph manifest, and it cannot override the missing revision-qualified
      edge producer or snapshot-bound Graphify execution.

Evidence: `scripts/atlas/audit-candidate-ordinal-admission-v1.mjs` and
`docs/reports/candidate-ordinal-admission-v1.json`.
Status: `CANDIDATE_ORDINAL_ADMISSION_READY`; authority=false;
writesPerformed=false.
First blocker: `CURRENT_GRAPH_MANIFEST_NOT_SEALED`.
Next gate: snapshot-bound Graphify edge materialization, then ordinal-map

## LEIDEN-NEO4J-IDENTITY-RECHECK-2026-09-10T21

- [x] Re-ran the read-only Neo4j candidate-ordinal identity audit over the
      `4,951` candidate map and `25,000` graph nodes.
- [x] Recorded `198` strong-identity resolutions, `19,013` source-ref-only
      resolutions, `5,624` unresolved nodes, and `165` ambiguous/rejected
      nodes. The projection checksum is
      `da3f6ab7f892ed54a10b9af56232d10eecc10fab9e5ccc3a5095745c1158170d`.
- [ ] Keep Leiden/graph promotion blocked: source-ref-only matches do not
      seal canonical identity, and ambiguous/unresolved nodes remain. No
      Neo4j, Leiden, ordinal, or graph writes occurred.

Evidence: `docs/reports/neo4j-candidate-ordinal-join-v1.json`.
Status: `BOUNDED_IDENTITY_READBACK_PARTIAL`; authority=false;
writesPerformed=false.
First blocker: `GRAPH_NODE_CANONICAL_IDENTITY_INCOMPLETE`.
Next gate: snapshot-bound structural lineage and sealed graph manifest.

## GRAPH-ORDINAL-RECHECK-2026-09-10T21

- [x] Re-ran the ordinal admission audit: `4,951` rows, dense ordinal
      coverage, and no duplicate or missing ordinals.
- [ ] Keep the ordinal map candidate-only. It is not sealed for the admitted
      workspace because current Graphify edge/source lineage and graph
      revision binding remain absent. No graph or ordinal writes occurred.

Evidence: `docs/reports/candidate-ordinal-admission-v1.json`.
Status: `CANDIDATE_ORDINAL_ADMISSION_READY`; authority=false;
writesPerformed=false.
First blocker: `CURRENT_GRAPH_MANIFEST_UNSEALED`.
Next gate: snapshot-bound Graphify execution and revision-qualified edge
materialization.
sealing against the same graph revision.

## GRAPH-ARTIFACT-READINESS-RERUN-2026-09-10T20

- [x] Re-ran the read-only current graph artifact readiness audit after the
      candidate ordinal check. The current artifact contains `16`
      observations and `16` unique graph node keys.
- [ ] Keep graph promotion blocked: `explicitRevisionQualifiedEdges=0`.
      Candidate ordinals do not prove a current graph manifest or a
      revision-qualified edge producer.

Evidence: `docs/reports/current-graph-artifact-readiness-v1.json` and
`docs/reports/candidate-ordinal-admission-v1.json`.
Status: `CURRENT_GRAPH_ARTIFACT_BLOCKED_ON_EDGE_PRODUCER`;
authority=false; writesPerformed=false.
First blocker: `CURRENT_REVISION_QUALIFIED_EDGE_PRODUCER_MISSING`.
Next gate: snapshot-bound Graphify edge materialization, then seal the
ordinal and graph manifests.

## GRAPH-ARTIFACT-READINESS-RECHECK-2026-09-10T22

- [x] Re-ran the read-only current graph artifact readiness audit.
- [x] Confirmed `observationCount=16`, `uniqueGraphNodeKeyCount=16`, and
      `explicitRevisionQualifiedEdges=0`.
- [ ] Keep graph manifest, ordinal sealing, Leiden, and projection promotion
      blocked until a snapshot-bound producer emits revision-qualified edges.

Evidence: `docs/reports/current-graph-artifact-readiness-v1.json`.
Status: `CURRENT_GRAPH_ARTIFACT_BLOCKED_ON_EDGE_PRODUCER`;
authority=false; writesPerformed=false.
First blocker: `CURRENT_REVISION_QUALIFIED_EDGE_PRODUCER_MISSING`.
Next gate: snapshot-bound Graphify edge materialization.

## LEIDEN-CANDIDATE-ORDINAL-READBACK-RECHECK-2026-09-10T23

- [x] Re-ran the read-only Neo4j candidate-ordinal identity join.
- [x] Confirmed `4,951` candidate ordinals were compared against `25,000`
      Neo4j nodes; `198` strong identities resolved, `19,013` are source-ref
      only, `5,624` are unresolved, and `165` are ambiguous.
- [ ] Keep Leiden and graph promotion blocked. The deterministic projection
      checksum is diagnostic only; no Neo4j, Leiden, ordinal, or graph writes
      occurred.

Evidence: `docs/reports/neo4j-candidate-ordinal-join-v1.json`.
Status: `IDENTITY_READBACK_PARTIAL`; authority=false; writesPerformed=false.
First blocker: `GRAPH_NODE_CANONICAL_IDENTITY_INCOMPLETE`.
Next gate: snapshot-bound structural lineage and a sealed graph manifest.
