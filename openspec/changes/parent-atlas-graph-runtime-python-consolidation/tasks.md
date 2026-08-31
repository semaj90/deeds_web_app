# Tasks: Parent Atlas Graph Runtime — Python Ownership Consolidation

## T0 — Capture (2026-08-29)

Created from a fork audit of 19 `python/` files matched by a pagerank/katz/eigenvector/k-truss/
networkx/cugraph grep. Nothing implemented yet — this is the reconciliation-and-scoping pass,
matching this repo's established discipline for external/large-surface changes (see
`parent-atlas-graph-runtime-enhancement` T0, `parent-atlas-agentic-repair-bundle-integration` T0).

**Not independently re-verified by a human yet** — the table below is the fork audit's output,
carried forward as-is. Before acting on any DEAD/EXPERIMENT classification, re-confirm the
zero-caller claim with a fresh grep (repo state moves).

## Audit table (source of truth for T1–T4 below)

| file | classification | action |
|---|---|---|
| `graph_snapshot_parity_networkx_oracle.py` | CANONICAL_OWNER (parity role) | leave untouched |
| `graph_snapshot_parity_cugraph_oracle.py` | CANONICAL_OWNER (parity role) | leave untouched |
| `atlas_rapids_sidecar.py` | CANONICAL_OWNER (cuVS domain) | leave untouched — grep false positive, real live service |
| `miniforge_nlp_sidecar.py` | ADAPTER (unrelated capability) | leave untouched — grep false positive |
| `parent_atlas_networkx_pagerank.py` | FIXTURE_ONLY | already correctly classified in registry — no change |
| `atlas_compute/typed_graph_runtime.py` | CANONICAL_OWNER (contract layer) | promote into new package as `identity.py` |
| `atlas_compute/live_graph_fixture.py` | FIXTURE_ONLY | leave as-is (or move to `atlas_graph_runtime/testing/` later, not this pass) |
| `atlas_semantic_ontology_projection.py` | ADAPTER (legitimate domain projection) | leave untouched — correctly scoped already |
| `atlas_rapids_graph_runtime.py` | ~~EXPERIMENT (tested, never deployed)~~ **CORRECTED 2026-08-31: BACKEND, deployed** | see note below |
| `atlas_subgraph_cugraph.py` | DEAD (zero callers) | reclassify in registry |
| `atlas_rapids_community_sidecar.py` | EXPERIMENT (no deployment found) | reclassify in registry |
| `atlas_compute/cugraph_ppr.py` | DEAD (zero callers) | reclassify in registry |
| `atlas_compute/graph_programs.py` | DEAD (zero callers, heapq-based — possible shadow of unstarted GR10) | reclassify in registry, note GR10 collision risk |
| `atlas_rapids_community.py` | ADAPTER (real caller: its own sidecar) | reclassify only if sidecar above is archived |
| `parent_atlas_pagerank_reference.py` | self-declared oracle, second hand-rolled implementation | **human decision required — see T2** |
| `parent_atlas_spectral_multihop.py` | UNCLASSIFIED | needs closer read — see T3 |
| `parent_atlas_context_fanout.py` | UNCLASSIFIED (likely grep false positive) | needs closer read — see T3 |
| `parent_atlas_code_graph_gpu.py` | UNCLASSIFIED (likely grep false positive) | needs closer read — see T3 |
| `gph_proj_cugraph_rtx_proof.py` | EXPERIMENT (proof/benchmark script) | leave or archive per repo convention — low priority |

## T1 — Registry reclassification (cheap, uncontroversial)

- [x] **`atlas_rapids_graph_runtime.py` — major correction (2026-08-31), then wired as a real
      cuGraph BACKEND.** Fresh caller grep found the fork audit's "never deployed" claim was wrong
      — it only checked `python/`, `scripts/`, `sveltekit-frontend/src/` and missed `services/`.
      Real chain confirmed: `services/atlas-gpu-8098/app.py` calls `install_graph_routes(app)` at
      import time and is the actual Docker `CMD` in `docker/atlas-gpu-8098/Dockerfile`, declared in
      `docker/docker-compose.gpu.yml` under the `atlas-gpu` profile with a real GPU device
      reservation. Separately, a complete TypeScript client
      (`sveltekit-frontend/src/lib/server/atlas/graph/atlas-rapids-pagerank-client.ts`) already
      existed with a passing spec — but had **zero callers**, so the deployed Python service and
      the working TS client were both real and both disconnected from each other and from the live
      app. **Wired end-to-end this session**:
      - Added a `resident()` method to the TS client (`GET /v1/graph/resident`).
      - Created `sveltekit-frontend/src/lib/server/graph/cugraph-pagerank-adapter.ts` — a second
        BACKEND under the existing canonical `graph_analysis` owner (`graph-analysis-runner.ts`),
        not a competing owner. Writes the SAME `graph_analysis_runs`/`graph_node_metrics` tables
        the Neo4j-GDS backend already writes, using the same transactional/batched-insert
        discipline. Fail-closed by design: if the sidecar is unreachable or has no graph resident,
        it returns a skipped result — it never auto-loads a snapshot (picking which
        `GRAPH_SNAPSHOT_PARITY` artifact to load is a separate operational decision, out of scope
        here).
      - Added `GraphAnalysisRequest.engine?: 'neo4j-gds' | 'cugraph-rapids'` to
        `graph-analysis-runner.ts` (additive — default is unchanged, existing Neo4j-GDS behavior).
      - `docs/architecture/runtime-ownership-registry.json`'s `graph_analysis.backends` now lists
        `cugraph-rapids-pagerank` as `UNIT_PROVEN_NOT_LIVE`.
      - **Verified**: `npx tsc --noEmit` clean on all 3 touched/new files; 3/3 new unit tests pass
        (`cugraph-pagerank-adapter.spec.ts` — unreachable-sidecar skip, no-resident-graph skip,
        full transactional-write happy path with mocked fetch/pg); existing
        `atlas-rapids-pagerank-client.spec.ts` still 3/3 pass (no regression from the new
        `resident()` method); `npm run atlas:audit:ownership` still passes with no new violations.
      - **NOT verified**: no live smoke test against a real running `atlas-gpu` Docker profile with
        real GPU + a real resident graph projection — that requires operator-side infra
        (`docker compose -f docker/docker-compose.gpu.yml --profile atlas-gpu up`, then loading a
        real snapshot via `/v1/graph/load`) not available from this session. Do not upgrade the
        registry status past `UNIT_PROVEN_NOT_LIVE` without that live proof.
      - This also resolves the T5 item below about `atlas_rapids_sidecar_graph.py` — confirmed it
        is a *different*, still-undeployed entrypoint (imports the base `atlas_rapids_sidecar.py`
        app + adds semantic512 routes on top) from the one actually deployed
        (`services/atlas-gpu-8098/app.py`); no name-collision risk, they're just two different
        FastAPI entrypoints and only one is wired into Docker today.
- [ ] Add entries to `docs/architecture/runtime-ownership-registry.json` for the 4 remaining
      zero/near-zero caller files above (`atlas_subgraph_cugraph.py`,
      `atlas_rapids_community_sidecar.py`, `atlas_compute/cugraph_ppr.py`,
      `atlas_compute/graph_programs.py`) with classification + evidence (caller-trace result) per
      file. Fresh grep already run for the first two (2026-08-31): both show only their own
      `__pycache__/*.pyc` as a "match" — confirmed zero real callers, DEAD.
- [ ] Re-run the caller grep fresh at reclassification time for the remaining 2
      (`atlas_compute/cugraph_ppr.py`, `atlas_compute/graph_programs.py`) — not yet done this pass.
- [ ] For `atlas_compute/graph_programs.py` specifically: check `parent-atlas-graph-runtime-enhancement`
      GR10 (semantic best-first, TypeScript, not yet started) before finalizing DEAD — if GR10 work
      begins and this file's heapq-based traversal turns out to be relevant prior art, surface it
      there rather than silently deleting.
- [ ] Update `runtime-ownership-baseline.json` if any of these are judged pre-existing tolerated debt
      rather than new violations (they predate this proposal, so baseline is the right bucket).

## T2 — `parent_atlas_pagerank_reference.py` — human decision

- [ ] Present the two options to a human (not a unilateral agent decision, per this file's own
      Design section on why hand-rolled algorithm code is a review-blocking defect in the new
      package, weighed against this file's legitimate self-declared oracle role and its explicit
      "not the production owner" framing):
      (a) keep as a third independent-of-libraries correctness oracle, formally registered
      `FIXTURE_ONLY` in the ownership registry with rationale recorded, or
      (b) archive it (per this repo's archive-not-delete convention) and fold whatever unique
      correctness coverage it provides into the existing `graph_snapshot_parity_*` oracle pair's
      test suite.
- [ ] Record the decision + rationale in the registry regardless of which option is chosen.

## T3 — Closer read required before classification

- [x] **`parent_atlas_spectral_multihop.py` (2026-08-31)** — read the actual math: `np.linalg.eigh`
      on a symmetric-normalized graph Laplacian, `np.linalg.svd`, and real `networkx` calls
      (`is_directed_acyclic_graph`, `topological_generations`, `to_numpy_array`,
      `topological_sort`). **Legitimate library-based spectral embedding, not a hand-rolled
      power-iteration loop** — does not share T2's policy-violation shape. Docstring is honest
      about scope ("deliberately bounded to the induced multihop subgraph... for large graphs use
      cuGraph/sparse solvers"). **New finding beyond what this task asked**: zero real callers
      found (`grep -rl` across `python/`, `scripts/`, `sveltekit-frontend/src/` — the one
      `python/atlas_compute/spectral.py` hit is an unrelated same-named local variable, not an
      import). Classification: legitimate but currently **DEAD** (no caller), not EXPERIMENT or a
      T2-style violation.
- [x] **`parent_atlas_context_fanout.py`, `parent_atlas_code_graph_gpu.py` (2026-08-31) — NOT grep
      false positives, correcting this task's own hypothesis.** Both contain real, library-based
      (not hand-rolled) graph-algorithm code:
  - `parent_atlas_context_fanout.py`: `networkx_reference()` calls real `nx.DiGraph` +
    `nx.single_source_shortest_path_length` as a correctness reference for `qdrant_fanout()`/
    `neo4j_fanout()` async candidate-merging logic. Zero callers found anywhere.
  - `parent_atlas_code_graph_gpu.py`: `pagerank_features()` calls `cugraph.pagerank()` directly,
    and `bounded_bfs()` calls `cugraph.bfs()`. **This directly extends CLAUDE.md's already-documented
    "5 competing PageRank implementations" finding (Duplication Prevention section, Aug 9 2026) —
    this would be a 6th, if it were live.** It isn't: zero callers found anywhere in `python/`,
    `scripts/`, or `sveltekit-frontend/src/`. Classification for both: legitimate library use, but
    **DEAD** (no caller) — not a live duplication conflict, but should be registered as tolerated
    debt extending the existing PageRank finding, not silently dropped from audit scope as this
    task originally proposed.
- [x] **`gph_proj_cugraph_rtx_proof.py` (2026-08-31)** — confirmed exactly as suspected: its own
      docstring says "RTX/cuGraph proof for GPH-PROJ-03/04... This is a proof harness, not a
      production graph owner." EXPERIMENT classification confirmed correct as originally guessed.

## T4 — Package scaffold

- [ ] Create `python/atlas_graph_runtime/` with `identity.py` (promoted from
      `atlas_compute/typed_graph_runtime.py`, contracts only, no behavior change) and a `README.md`
      stating the hard rule from `proposal.md`'s Design section.
- [ ] Add empty `cugraph_executor.py`, `networkx_executor.py`, `cuvs_executor.py`, `cuml_executor.py`
      placeholders — docstring only, pointing at this proposal + the future gate (GR7) that
      populates them. No implementation in this pass.
- [ ] Do NOT move or modify `atlas_compute/typed_graph_runtime.py`'s existing test files
      (`test_typed_graph_runtime.py`, `test_atlas_compute_graph_representation.py`) — update their
      imports only if/when the promotion in this task actually moves the module; if kept as a
      re-export shim instead, no test changes needed.

## T5 — Follow-up audit scope (tracked, not resolved here)

- [x] `python/atlas_rapids_sidecar_graph.py` (2026-08-31) — audited as part of the T1 wiring above.
      It's a different, still-undeployed FastAPI entrypoint (imports the base `atlas_rapids_sidecar.py`
      app and layers semantic512 routes on top of the graph routes) from the one Docker actually
      runs (`services/atlas-gpu-8098/app.py`). No name collision — just two separate entrypoints,
      only one wired into `docker-compose.gpu.yml` today.
- [ ] `scripts/atlas/run_louvain_challenger_v1.py` — "challenger" naming suggests an A/B algorithm
      comparison; check it doesn't collide with the already-settled Louvain/Leiden ownership in
      `parent-atlas-graph-analysis-contract` before it's touched by anything.

## Cross-references

- `openspec/changes/parent-atlas-graph-runtime-enhancement/proposal.md` — GR7 (blocked behind
  GR5.3–GR6) is this package's eventual first real consumer.
- `openspec/changes/parent-atlas-graph-analysis-contract/` — settled TS/Neo4j-GDS PageRank/Louvain
  ownership, unaffected by this proposal.
- `sveltekit-frontend/src/lib/server/atlas/graph/graph-algorithm-policy.ts` — the TypeScript-side
  pattern this package mirrors on the Python/RAPIDS side.
- Root `CLAUDE.md`, "Duplication Prevention" section — the Aug 9 2026 "5 competing PageRank
  implementations" finding this proposal's audit extends to the Python cluster.

## GPU expansion dependency crosswalk (2026-08-31)

The tensor-residency expansion workboard tracks shared dependencies without
moving graph ownership here. This graph runtime owns only the graph side:

- [ ] **GPU-EXP-14** GraphProjectionArtifactV1 with explicit `GraphOrdinal`,
  graph revision, vertex checksum, edge checksum, and ordinal-map checksum.
- [ ] **GPU-EXP-15** bounded multi-hop traversal with predecessor/path receipt;
  depth policy is 2 normally, 3 expanded, 4 hard maximum.
- [ ] **GPU-EXP-16** NetworkX oracle → cuGraph executor parity, including any
  internal renumbering translation and deterministic replay.

GPU cache, HNSW, QLoRA, and 4D coordinate tasks remain owned by their existing
OpenSpecs. A graph result is derived evidence and cannot become CandidateOrdinal,
canonical identity, or an additional retrieval vote.
