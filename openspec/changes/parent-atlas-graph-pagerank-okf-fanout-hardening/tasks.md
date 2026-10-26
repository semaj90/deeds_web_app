# Graph / PageRank / OKF Fanout Hardening — Session Handoff (2026-08-21)

Status: **PROVEN** — all 12/12 tests across the 4-spec suite pass live, reproduced twice, ~10s total runtime.

## Context

This session's work replayed findings from a parallel session operating in a
different clone (`deeds-web-app-post17-clean`) that had run a graph/PageRank/
OKF/Qdrant-fanout audit and reported gaps. Rather than trust that clone's
summary, this session independently reproduced the failures in **this**
repo (`C:\Users\james\Videos\deeds-web-app`) by running the real test suite,
then fixed what was verifiably broken here.

Command used to reproduce (from `sveltekit-frontend/`):
```
node_modules/.bin/vitest run --config vitest.lane-contracts.config.ts \
  src/lib/server/atlas/graph/graph-qdrant-fanout-alignment.spec.ts \
  src/lib/server/atlas/graph/okf-schema-validation.spec.ts \
  src/lib/server/atlas/graph/atlas-rapids-pagerank-client.spec.ts \
  src/lib/server/atlas/graph/pagerank-parity.spec.ts
```

Final result (both runs): `Test Files 4 passed (4)` / `Tests 12 passed (12)`, ~10s.

## Fixed and verified live

- [x] **RAPIDS PageRank async-rejection bug** — `sveltekit-frontend/src/lib/server/atlas/graph/atlas-rapids-pagerank-client.ts`.
  `pagerank: (input) => { assertPageRankRequest(input); ... }` was a plain
  synchronous arrow function. `assertPageRankRequest()` throws synchronously
  on invalid input (duplicate seeds, too many candidates, etc.), which meant
  the throw happened **before** any Promise existed — so
  `await expect(client.pagerank(...)).rejects.toThrow(...)` in the spec
  couldn't catch it; the test itself crashed instead of asserting a
  rejection. Fixed by making the function `async`, so any synchronous throw
  inside it now correctly becomes a rejected Promise.

- [x] **OKF schema vocabulary mismatch** — `sveltekit-frontend/src/lib/server/atlas/graph/okf-schema.ts`.
  `RelationshipNameSchema` and the `node_types` enum were missing values
  that the real `.okf/manifest.yaml` at repo root actually uses. Extracted
  the exact, complete vocabulary directly from the manifest's
  `relationships:` and `graph_projection:` blocks (not from the truncated
  error message) and added:
  - relationships: `specifies`, `uses_table`, `uses_column`, `auth_guards`,
    `validates`, `blocks`, `observed_at_runtime`,
    `authorized_resource_mutation`
  - node_types: `feature`, `evidence`, `relationship`

- [x] **`pagerank-parity.spec.ts` hang — ROOT CAUSE FOUND AND FIXED.** This
  was NOT a single bug — it was **two independent scripts sharing the same
  flawed default-fixture-selection pattern**, compounded by a real perf bug
  in one of them:

  1. `python/parent_atlas_networkx_pagerank.py:106` — `argparse` default
     for `--fixture` is `DEFAULT_FROZEN_FIXTURE if DEFAULT_FROZEN_FIXTURE.exists()
     else DEFAULT_FIXTURE`, where `DEFAULT_FROZEN_FIXTURE =
     graphify/frozen-graph-snapshot-v2.json`. That file **exists locally and
     is 486,654,818 bytes**. Confirmed via direct count: **162,234 nodes /
     108,156 edges**. NetworkX `pagerank()` on a graph that size is slow but
     survivable.
  2. `scripts/atlas/compute-pagerank-neo4j-v2.mjs:18-24` has the **exact same
     default-fixture bug** (same frozen-snapshot-if-it-exists logic), but
     it's far more severe here: the script writes fixture data into Neo4j
     with **one sequential `await session.run(...)` per node, then one
     sequential `await session.run(...)` per edge** (lines 76-101) — no
     batching, no `UNWIND`. For the 486MB snapshot that's **270,390
     sequential Cypher round-trips**, each individually awaited. This is
     what actually produced the multi-minute hangs (two separate background
     vitest runs were killed via `TaskStop` earlier this session after 10+
     minutes each) — not slow JSON parsing as originally suspected.

  **Fix applied**: `pagerank-parity.spec.ts` now explicitly passes
  `--fixture <path-to-the-6-node/5-edge-test-fixture>` to BOTH subprocess
  invocations (`run('python', [pythonOracle, '--fixture', pythonFixture])`
  and `run('node', [gdsRunner, '--fixture', pythonFixture, '--json'])`),
  removing any dependency on either script's own default-selection logic.
  Root cause and fix are documented inline in the spec file as a comment.

  **Verified**: full 4-spec suite now runs in ~10s and passes 12/12, twice
  in a row. `NEO4J_GDS_PROVEN: true`, Spearman correlation `1.0`, max score
  delta `2.75e-9` — Neo4j GDS is genuinely available and passes parity in
  this environment (updates the prior assumption in this repo's docs that
  Neo4j GDS / RAPIDS parity was NOT_PROVEN — GDS specifically now IS proven;
  RAPIDS/cuGraph GPU parity was not exercised by this suite and remains
  unaddressed).

- [x] **PageRank fixture ingestion bounded (2026-09-24, code/test proof only).**
  `compute-pagerank-neo4j-v2.mjs` now defaults to the small parity fixture rather
  than silently selecting the 162K-node frozen snapshot. The explicit large-input
  path uses `UNWIND $rows` in batches of 1,000 for nodes and edges, grouping
  relationships by an allowlisted type and rejecting unsupported types before
  fixture writes. Four fake-session tests prove batching, preserved run/snapshot
  qualification, edge mapping, and pre-write rejection. No Neo4j script execution,
  live graph loading, PageRank projection, or datastore write was performed; live
  throughput/parity remains outside this task's proof.

## Historical next steps (as of the original handoff; status reconciled below)

1. **Commit the 5 touched files** — historical handoff state; the later
   2026-09-05 re-verification below records that this was completed.
2. **Large-input PageRank ingestion** — the default-fixture and sequential-write
   issues were addressed by the 2026-09-24 bounded-ingestion task below. Live
   throughput/parity for a full snapshot remains unproven and is not run here.
3. Decide on RAPIDS/cuGraph GPU PageRank parity — genuinely NOT_PROVEN in
   this repo (not addressed this session — Neo4j GDS parity specifically IS
   now proven, but that's a different lane from RAPIDS GPU).
4. Do **not** trust the parallel clone's (`deeds-web-app-post17-clean`)
   reported fixes without re-verifying them here first, the same way this
   session did for all 3 issues above — its file paths and specific claims
   do not necessarily reflect this repository's actual state.

## Historical re-verification snapshot (2026-09-05, read-only; current status superseded 2026-09-24)

- **"Next steps" item 1 (commit the 5 touched files) — DONE.** `git status --porcelain` on the 3
  files named below is clean; `git log` shows them committed. Not previously checked off as a
  task item since this file predates that convention, but confirmed live, not assumed.
- **"Next steps" item 3 (decide on RAPIDS/cuGraph GPU PageRank parity) — RESOLVED, separately.**
  Commit `7be35ec708` (2026-08-31, "Wire cuGraph/RAPIDS as a second GPU pagerank backend under the
  canonical graph_analysis owner") wires `cugraph-pagerank-adapter.ts` as a second `BACKEND` under
  the existing canonical `graph_analysis` owner (`graph-analysis-runner.ts`) — same
  `graph_analysis_runs`/`graph_node_metrics` tables the Neo4j-GDS backend already writes, not a
  competing owner. This was a real, substantive fix to a previously-open decision, done in a
  different change/session than this handoff, not tracked back here until now.
- At the time of this 2026-09-05 snapshot, the sequential-write issue in
  `compute-pagerank-neo4j-v2.mjs` was believed to remain. The 2026-09-24 bounded-ingestion task
  below supersedes that current-status conclusion. The historical inspection recorded that lines
  17-24 still default `--fixture` to the 486MB `graphify/frozen-graph-snapshot-v2.json` snapshot
  when no `--fixture` flag is passed; lines 76-101 still issue one `await session.run(...)` per
  node then one per edge inside a plain `for` loop — zero occurrences of `UNWIND` anywhere in the
  file. Running this script without `--fixture` against the full ~162K-node/108K-edge frozen
  snapshot would still reproduce the original multi-minute hang. Genuinely unfixed, exactly as
  flagged — not stale, not resolved elsewhere in the portfolio (no other change references this
  specific script).

## Files touched this session

- `sveltekit-frontend/src/lib/server/atlas/graph/atlas-rapids-pagerank-client.ts` — `pagerank` made `async`.
- `sveltekit-frontend/src/lib/server/atlas/graph/okf-schema.ts` — vocabulary alignment.
- `sveltekit-frontend/src/lib/server/atlas/graph/pagerank-parity.spec.ts` — `maxBuffer` added to `run()`; both subprocess calls now pin `--fixture` to the small test fixture explicitly instead of relying on either script's own default-selection logic.

No graph, Qdrant, Postgres, Neo4j, or Valkey writes occurred outside the
existing fixture-isolated test path (the Neo4j GDS runner creates and tears
down its own `:AtlasContextNode` fixture nodes scoped to a random
`fixture_run_id`, per its existing design). No commit was made for these
files yet — they are uncommitted local changes on `main` at the time of this
handoff.

## 2026-10-13 — Canonical Top-K Contract, Deterministic Parity & TRACE Audit

### Canonical Top-K Contract Gates (TOPK-04..09)

- [x] **TOPK-04 CPU/CUDA Deterministic Tie Parity**:
  - Implemented tlas.topk.v1 contract with canonical ordering SCORE_DESC_ORDINAL_ASC_ID_ASC (Score DESC -> CandidateOrdinal ASC -> CanonicalId ASC).
  - Fixed PyTorch 	orch.topk tie instability in python/atlas_compute/topk_paginator.py with boundary tie expansion and deterministic ordering via ordinals and canonical IDs.
  - Implemented stable_topk CPU reference using bounded min-heap with strict comparator eviction of worse candidates on ties.
  - Rejection policy enforced: non-finite scores (NaN, Infinity, -Infinity) are rejected before ranking in both TypeScript and Python.
  - Validation: 9/9 Vitest tests passed in 	opk-paginator.spec.ts; 7/7 Python unittest tests passed in 	est_topk_paginator.py.
- [x] **TOPK-05 Pagination Consistency**:
  - Validated boundary offset pagination: no missing or repeated IDs across contiguous slices [offset : offset + k].
  - Schema alignment: CanonicalTopKResultV1 emitted by both canonicalTopKPaginate() in TypeScript and stable_topk() in Python.
- [ ] **TOPK-06 Memory Ceiling**:
  - Bounded retention test for 162K candidate snapshots: enforce O(offset + k) heap/slice memory envelope instead of full-array sorting.
- [ ] **TOPK-07 Revision/Canonical ID Readback**:
  - Verify selected candidates resolve cleanly against PostgreSQL 18 (sourceRef, sourceRevision, CandidateOrdinal) state.
- [ ] **TOPK-08 N-API/Sidecar Boundary Audit**:
  - Python computation adapter re-exports tested helpers cleanly under tlas_compute without premature custom CUDA/N-API bindings.
  - Defer custom GEMM kernels; PyTorch and cuBLASLt own tensor operations until a measured latency or memory gap is proven.
- [ ] **TOPK-09 Agentic Search Integration**:
  - Guarantee identical admitted ContextManifest cold and warm across BitFrost token FSM swaps and local llama-server:8090 (ornith-1.5-9b).

### TRACE Live Diagnostic Audit (2026-10-13; Read-Only)

- **System Health Review**:
  - Healthy: PostgreSQL 18, Valkey/Redis :6379, Qdrant :6333, Neo4j, Bifrost, llama-server:8090 (ornith-1.5-9b), Go retrieval, TRACE MCP.
  - Degraded: Topology service on :8101 and rerank service on :8099 are DOWN. Health check port labeling discrepancy noted (:8090 vs :8080).
- **Native Acceleration**:
  - Reported NATIVE_BACKEND_UNAVAILABLE for native simdjson backend, confirming active fallback to JSON.parse (supports KAFKA-19).
- **ACE Packet Quality Defect**:
  - tlas_packet_search inspection revealed a stored canonical packet summary (graph-ml-client.ts) containing raw drafting scratch text ('The summary needs to be 1-2 sentences... Drafting the summary').
  - Remediation flagged: add schema validator rejecting model drafting text before packet admission into Valkey or PostgreSQL.
