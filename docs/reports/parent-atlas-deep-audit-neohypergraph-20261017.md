# Parent Atlas Deep Audit: Graph, Import Resolution, and GPU Readiness

**Date:** 2026-10-17  
**Mode:** Read-only investigation; no canonical writes or projection changes.  
**Overall verdict:** `PARTIAL_DIAGNOSTIC_ONLY`

## Summary

The standalone NetworkX CPU oracle ran successfully against the checked-in six-node fixture. This proves the reference implementation can calculate the fixture result in the WSL Python environment; it does not prove parity with Neo4j GDS, a current GraphV2 snapshot, PostgreSQL graph rows, or SearchRuntime fanout.

The structural import-resolution builder and single-file projection pipeline exist, but the cross-file context builder has no production caller in the searched indexing tree. Its production use is therefore not established. The proposed live cohort join, domain classification, N-ary graph read, graph fanout, and GPU execution were not run. No graph refresh, database query/write, Neo4j operation, Qdrant operation, model load, or GPU workload was performed.

## Findings

| Gate | Finding | Verdict |
|---|---|---|
| `PR-PARITY-01` | WSL Python 3.14 imported NetworkX 3.6.1 and ran the frozen six-node/five-edge fixture. Output status was `NETWORKX_REFERENCE_PROVEN`; topology hash `33586a9976159cc7a4fcb7f290c62da7e5508b8c4938f6f3d196dec97101dcae`; result hash `37ceeb856f68a9363e0e563c8c2eb7df20388d946e3afb7f07525740b78836e5`. The paired Vitest parity spec was deliberately not run because its Neo4j runner creates and removes temporary fixture nodes/edges. | `CPU_REFERENCE_PROVEN`; cross-engine parity `NOT_RUN` |
| `XFILE-BATCH-01` | `buildGraphifyImportResolutionContextsV1` builds revision-bound import/export context for a multi-file cohort, and tests exercise it. The structural projection pipeline accepts that context, but no production caller was found in the targeted indexing search. | `HELPER_AND_FIXTURE_PRESENT`; `PRODUCTION_CALLER_NOT_FOUND` |
| `SOURCE-JOIN-01` | No live source/packet/chunk join was attempted. The current exact admitted workspace cohort and source revisions were not re-read in this audit. | `NOT_RUN` |
| `DOMAIN-01` | Classification and ontology components are present in the repository, but this audit did not establish a current evidence-qualified input cohort or run a classifier. | `IMPLEMENTATION_PRESENT`; `LIVE_QUALIFICATION_NOT_PROVEN` |
| `NARY-01` | N-ary contracts, admission helpers, and retrieval readers exist. This audit did not prove a current source-revision-qualified N-ary fact or its participants against live PostgreSQL/Neo4j. | `CODE_PRESENT`; `LIVE_FACT_NOT_PROVEN` |
| `GRAPH-READ-01` | SearchRuntime/fanout integration and bounded traversal code are present, but no live graph candidate expansion or final Top-K/ContextManifest replay was performed. | `WIRED_IN_CODE`; `LIVE_RETRIEVAL_NOT_PROVEN` |
| `GPU-PR-01` | No cuGraph/cuVS or CUDA graph operation ran. The CPU fixture result is not GPU evidence. | `NOT_RUN` |
| `DAILY-OWNER` | The repository’s daily Graphify command family includes chain/apply-capable stages. A refresh was intentionally not run; the attached audit’s prior entry-point counts are not independently recounted here. | `REFRESH_DEFERRED` |

## Additional live read-only checks

- `:8095/health` returned `ok`. Its runtime reports Tree-sitter, chunker, ast-grep, NetworkX, and classification helper available; `cugraph`, `nx_cugraph`, cuVS, CuPy, and Torch are unavailable in this service. The sidecar explicitly identifies RAPIDS as an external WSL executor.
- `:8098/health` returned `ok`, identifies the RTX 3060 Ti and CUDA as available, and reports Torch unavailable. Its health contract declares no PostgreSQL, Qdrant, or Valkey writes. A health response is not proof that a graph kernel ran.
- WSL package discovery found `networkx`, `cugraph`, `nx_cugraph`, `cupy`, and `torch` modules in `atlas-rapids-cu13`. This verifies discoverability only; imports and graph kernels were not run.
- `nvidia-smi` reported 1,534 MiB used, 6,491 MiB free of 8,192 MiB, and 23% utilization at probe time. This is a point-in-time reading, not a reserved VRAM budget or admission decision.
- The two focused Vitest specs were retried with one fork. Vitest started, emitted no test results for 30 seconds, then was interrupted. Status remains `UNVERIFIED`.
- The existing parity spec was inspected but not run: its Neo4j fixture runner creates fixture nodes and relationships, then deletes them. The runner uses `gds.pageRank.stream`, but the wrapper still has temporary graph-store side effects; it is not a no-write test.
- The user-pasted sparse-incidence test failure is stale relative to the current worktree. `SparseIncidenceTensorV1.values` is a `Float32Array`, and the current spec uses `toBeCloseTo(..., 5)` rather than exact decimal equality. Rerunning that exact spec passed 3/3. This validates Float32 fixture behavior only; it does not prove live PostgreSQL incidence, GPU parity, or production N-ary data.

## Batch caller and cohort forensics

- Repository-wide bounded search found no production call to `buildGraphifyImportResolutionContextsV1` and no invocation of `runGraphifyStructuralBatchV1`; the import-context builder is only referenced by its contract tests. `graphify-structural-projection-pipeline-v1.ts` accepts a precomputed context but is not itself a batch caller.
- The existing `graphify:symbols:extract` package command points to `scripts/atlas/graphify-symbol-extractor-v1.mts`. That is a separate symbol-extraction writer with explicit apply/freeze gates; it does not invoke the import-context builder. The command was not run.
- The available `current-source-projection-cohort-v1.json` is dated 2026-09-05 and records 16,629 candidates, including 52 exact file-byte matches. Those rows carry workspace revision `sha256:7a95c0843ebb4203309bc4396ba31313fbd973d08439822ee2bdbd39531fb401`, which differs from the admitted snapshot receipt’s `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`. It is stale planning evidence, not a safe current cohort.
- The existing `audit-current-source-cohort-lineage-v1.mjs` is read-only against PostgreSQL but processes the entire checked-in cohort and writes a fixed report path. It has no bounded-row or output-path option. It was not run because that would not meet the requested bounded scope and would overwrite a repository report.
- Therefore no candidate acceptance/rejection counts or fresh snapshot digest are claimed for AST → chunk → source joins. The bounded cohort gate remains blocked until an authoritative current-revision receipt and a non-overwriting bounded read-only runner are available.
- Focused fixture validation now passes for the two pure code paths: `graphify-symbol-projection-v1.spec.ts` 12/12 and `graphify-structural-projection-pipeline-v1.spec.ts` 3/3. These confirm the helper and projection contract behavior only; neither test invokes a production batch caller, PostgreSQL, Neo4j, or a graph writer.

## Execution details and limitation

- Successful command: `wsl.exe -e /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python /mnt/c/Users/james/Videos/deeds-web-app/python/parent_atlas_networkx_pagerank.py --fixture /mnt/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/atlas/graph/fixtures/pagerank-parity-graph.json`.
- The first attempted path was wrong and the resulting attempt selected a missing fixture, causing the script to invoke the graph exporter. That exporter failed before producing a result because WSL Node resolved Windows `node_modules` and could not load the Linux esbuild binary. The corrected run explicitly used the existing fixture and did not regenerate it. No successful export or data write is claimed.
- The two focused Vitest specs were started, produced no diagnostics during the bounded wait, and were interrupted. They are `UNVERIFIED`, not passes.
- Neo4j parity tests were skipped because the inspected runner writes temporary fixture graph data. No database or service census was conducted.

## Safe next gates

1. Give the import-context builder an explicit read-only batch caller that consumes one frozen, revision-qualified cohort; retain `canonicalAuthority: false` and emit an input digest plus per-file source/workspace revisions.
2. Prove one bounded source → AST/import → packet/chunk join using existing read-only auditors and exact byte spans. Do not assign identities from filenames or fuzzy symbol matches.
3. Re-run the Neo4j parity harness only after its temporary-write behavior is replaced with an isolated test database/fixture or the operator explicitly authorizes that bounded fixture mutation.
4. Establish current qualified N-ary graph rows before attempting graph fanout; then test candidate lineage, fusion deduplication, final Top-K, and ContextManifest as separate gates.
5. Attempt GPU parity only after a frozen graph input, NetworkX reference, available device/runtime, memory budget, and safe fallback are established.

## Closeout

- Canonical writes: none performed.
- Graphify refresh: not run.
- Neo4j/Qdrant/PostgreSQL: not accessed in this audit.
- GPU/model execution: not run.
- Production readiness or promotion: not established.

```yaml
likely_cause: Cross-file import resolution is implemented as a tested helper but lacks a discovered production cohort caller; live graph and retrieval evidence remain unqualified or untested.
evidence:
  - python/parent_atlas_networkx_pagerank.py
  - sveltekit-frontend/src/lib/server/atlas/graph/fixtures/pagerank-parity-graph.json
  - sveltekit-frontend/src/lib/server/atlas/indexing/graphify-symbol-projection-v1.ts
  - sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-projection-pipeline-v1.ts
  - sveltekit-frontend/src/lib/server/atlas/graph/pagerank-parity.spec.ts
patch_targets:
  - docs/reports/parent-atlas-deep-audit-neohypergraph-20261017.md
safe_next_command: "Inspect and implement a read-only caller for buildGraphifyImportResolutionContextsV1 over one frozen, revision-qualified cohort."
smoke_command: "wsl.exe -e /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python /mnt/c/Users/james/Videos/deeds-web-app/python/parent_atlas_networkx_pagerank.py --fixture /mnt/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/atlas/graph/fixtures/pagerank-parity-graph.json"
report_path: docs/reports/parent-atlas-deep-audit-neohypergraph-20261017.md
```
