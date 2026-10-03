# Graph / ACE / GPU first-tranche checkpoint — 2026-09-27

## Scope

Read-only capability inspection and local/fixture implementation only. No Graphify run, graph load, cache warm, model call, or datastore write was performed.

## IMPLEMENTED

- Added `atlas_graph_runtime.networkx_executor` as a thin adapter over the established `atlas_compute.typed_graph_runtime` NetworkX owner for PageRank and weighted SSSP. Exported those calls from the package; no graph algorithm or identity logic was duplicated.
- Hardened `scripts/atlas/prove-ace-fso-03-live-v1.mts`: unresolved sentinel revisions are rejected before database access, and `accepted + rejected` must conserve the candidate map. `missing` now means every rejected candidate, not only candidates with no stored row.
- Existing ContextManifestV2 → PromptPlanV1 bridge remains unchanged and is exercised by its existing focused tests.

## PROVEN

- **NetworkX:** local `.venv` NetworkX 3.6.1; PageRank and SSSP adapter tests plus compatibility tests passed 16/16.
- **RAPIDS environment:** WSL `atlas-rapids-cu13` imports NetworkX 3.6.1, cuGraph 26.6.0, cuDF 26.6.1, cuVS 26.6.0, PyTorch 2.13.0, and NumPy 2.4.6. This is package availability, not an execution/parity receipt.
- **8098 service:** `/v1/graph/capabilities` reports cuGraph PageRank available (service backend 26.08.00); `/v1/graph/resident` reports `resident: null`. The service/runtime version differs from the WSL Python package version and must be reconciled before attributing a GPU run to one environment.
- **Context handoff fixtures:** ContextManifest→PromptPlan and ACE prompt bridge suites passed 9/9. Together with the existing ORF reader suite, the Vitest command passed 17/17.
- **FSO-03 historical receipt:** `ace-fso-03-live-receipt-v1-20260927T000240Z.json` is not admissible proof: it pins `representationRevision=repr:unset`, maps 0 rows, and reports `missing=16142` while 9 more rows were rejected. It is retained as history; the runner is corrected. No fresh DB replay was run because no admitted immutable representation revision is available to pin.

## STILL UNWIRED / BLOCKED

- **GPU-DAG-CANARY:** blocked. No graph is resident on 8098; there is no proven common frozen artifact identity across cuVS index, hypergraph incidence, feature GEMM input, and GPU residency entries. Therefore no first-run materialization/second-run HIT or no-repeat-H2D claim is made.
- **GPU-FABRIC-AUDIT:** only schema/code inspection so far. Existing owners carry CandidateOrdinal snapshot/map checksums in their own contracts, but cross-owner equality on one frozen artifact has not been executed.
- **ACE-FSO-03 live path:** reader implementation and tests exist; server-owned route/runtime caller and a fresh valid-revision live receipt remain unproven. Existing table census indicates no exact current cohort rows; historical rows must not be revision-stamped.
- **Feature producer proposal:** the old 1,808-row observation set is historical and mostly outside the 16,151 candidate cohort; no approved producer/revision/evidence pipeline currently populates exact current ORF rows. Do not widen by stamping.
- **Context handoff:** fixtures prove the adapter contract only. No live CandidateOrdinal result was transformed into an admitted ContextManifestV2/PromptPlanV1 in this tranche.
- **Graph capability census:** callable availability is recorded above, but Neo4j GDS algorithm invocation and service/package version parity have not been tested here. cuVS is not a PageRank executor; SIMT remains out of scope without a measured gap.

## NOT TOUCHED

PostgreSQL/Qdrant/Valkey/Redis/RabbitMQ/NATS/Neo4j writes; Graphify apply/daily; graph loading; broad feature production; model training or inference; production retrieval/ranking; SIMT/cuTile kernels.

## Validation

- `python -m pytest -q python/tests/test_networkx_executor.py python/tests/test_typed_graph_runtime.py` — 16 passed.
- `npx vitest run src/lib/server/atlas/context/context-manifest-prompt-plan-v1.spec.ts src/lib/server/atlas/context/ace-context-prompt-plan-bridge-v1.spec.ts src/lib/server/atlas/retrieval/orf-feature-row-reader-v1.spec.ts` — 17 passed.
- FSO-03 runner sentinel guard — a pinned `repr:unset` probe exited 64 before map/database access.
- OpenSpec strict validation passed for graph-runtime consolidation, ACE RLM/BitFrost integration, and candidate-feature execution fabric; scoped `git diff --check` passed.
