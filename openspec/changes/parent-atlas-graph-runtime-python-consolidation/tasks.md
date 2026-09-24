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
- [x] Add entries to `docs/architecture/runtime-ownership-registry.json` for the 4 files flagged
      above (`atlas_subgraph_cugraph.py`, `atlas_rapids_community_sidecar.py`,
      `atlas_compute/cugraph_ppr.py`, `atlas_compute/graph_programs.py`) with classification +
      evidence (caller-trace result) per file. **Correction (2026-09-23):
      only 3 of these 4 are actually zero/near-zero-caller — `graph_programs.py` has a real,
      currently-passing test exercising its API and should not be classified alongside the other
      3.** Fresh grep already run for the first two (2026-08-31): both show only their own
      `__pycache__/*.pyc` as a "match" — confirmed zero real callers, DEAD.
- [x] Re-run the caller grep fresh at reclassification time for the remaining 2
      (`atlas_compute/cugraph_ppr.py`, `atlas_compute/graph_programs.py`) — done, and the two
      files land in different classifications, not the same one:
      - **`atlas_compute/cugraph_ppr.py`**: eagerly imported by `atlas_compute/__init__.py`
        (line 11, re-exports `CuGraphPprParityReceipt`/`run_cugraph_ppr_parity`) — reachable as
        an import-time side effect of any of the 45 real files that do
        `from atlas_compute.<submodule> import ...` (any submodule import runs the package
        `__init__.py` first). But grepped every one of those 45 callers plus the rest of
        `python/`: **zero of them actually call `run_cugraph_ppr_parity()` or reference
        `CuGraphPprParityReceipt`** outside the module's own definition. Import-reachable, not
        functionally used anywhere — a real distinction from the two fully pycache-only-dead
        files above, but not `PROVEN` either. Recommend `FIXTURE_ONLY`-or-`DEAD` per the
        ownership vocabulary, not a third `DEAD` twin of the confirmed-dead pair.
      - **`atlas_compute/graph_programs.py`**: same import-reachability as above, PLUS genuinely
        called — `python/test_atlas_compute_graph_representation.py` imports and calls both
        `deterministic_bfs()` and `condense_and_lexicographically_sort()`. Re-ran that test live:
        `python -m pytest python/test_atlas_compute_graph_representation.py -q` → **4 passed**.
        Not dead, not near-zero-caller — has a real, currently-passing test exercising its actual
        API. It is registered separately as `FIXTURE_ONLY`; GR10 is a distinct TypeScript semantic
        best-first feature, not this Python BFS/topological-order helper.
      - `atlas_subgraph_cugraph.py` is registered `DEAD` (read-only CLI, no caller/deployment hit).
      - `atlas_rapids_community_sidecar.py` is registered `EXPERIMENT` (standalone bounded API,
        no deployment hit; its implementation helper remains used by a frozen-fixture challenger).
      - `atlas_compute/cugraph_ppr.py` is registered `DEAD`: package-import reachable via the eager
        barrel, but its function/receipt have no functional caller or test use.
      Registry entries preserve the deployed TypeScript/Neo4j-GDS canonical owner and make no
      deletion or runtime change.
- [x] For `atlas_compute/graph_programs.py`, compare against
      `parent-atlas-graph-runtime-enhancement` GR10 before classification. GR10 is explicitly
      semantic best-first in TypeScript; the Python helper implements deterministic BFS and SCC/DAG
      ordering. It remains useful as `FIXTURE_ONLY` reference code, not DEAD and not a GR10 owner.
- [x] Update `runtime-ownership-baseline.json` for these four pre-existing, noncanonical artifacts
      (`DEAD`, `EXPERIMENT`, or `FIXTURE_ONLY`) so the ownership audit treats them as documented
      existing state rather than newly introduced ownership violations.

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

- [x] Create `python/atlas_graph_runtime/` with `contracts.py` (the `TypedGraphEdge`,
      `GraphExecutionReceipt`, and `GraphBackend` declarations extracted from
      `atlas_compute/typed_graph_runtime.py`, with no algorithm moved) and a `README.md`
      stating the hard rule from `proposal.md`'s Design section.
- [x] Add empty `cugraph_executor.py`, `networkx_executor.py`, `cuvs_executor.py`, `cuml_executor.py`
      placeholders — docstring only, pointing at this proposal + the future gate (GR7) that
      populates them. No implementation in this pass.
- [x] Do NOT move or modify `atlas_compute/typed_graph_runtime.py`'s existing test files
      (`test_typed_graph_runtime.py`, `test_atlas_compute_graph_representation.py`) — update their
      imports only if/when required. Tests remained in place and their existing import paths are
      preserved by the compatibility module; this tranche did not edit either test file.

## T5 — Follow-up audit scope (tracked, not resolved here)

- [x] `python/atlas_rapids_sidecar_graph.py` (2026-08-31) — audited as part of the T1 wiring above.
      It's a different, still-undeployed FastAPI entrypoint (imports the base `atlas_rapids_sidecar.py`
      app and layers semantic512 routes on top of the graph routes) from the one Docker actually
      runs (`services/atlas-gpu-8098/app.py`). No name collision — just two separate entrypoints,
      only one wired into `docker-compose.gpu.yml` today.
- [x] `scripts/atlas/run_louvain_challenger_v1.py` — audited 2026-09-23 against the settled
      Louvain/Leiden production ownership in `parent-atlas-graph-analysis-contract`. It is a
      read-only frozen-fixture challenger, not a second production owner: it imports and calls
      `python/atlas_rapids_community.py::run_cugraph_partition` with `algorithm="louvain"`,
      emits a comparison receipt, and does not write canonical graph or retrieval state. The
      production TypeScript/Neo4j-GDS owner remains separate and unchanged. Fresh caller search
      found only the explicit live-graph-proof task references; no runtime registration or
      canonical writer caller. No execution, graph write, or promotion was performed.

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

- [x] **GPU-EXP-14** GraphProjectionArtifactV1 with explicit `GraphOrdinal`,
  graph revision, vertex checksum, edge checksum, and ordinal-map checksum. **PROVEN at
  noncanonical artifact-builder/fixture scope (2026-09-23):** the builder emits
  `atlas.graph-projection-artifact.v1`, keeps `candidateOrdinalMapChecksum` separate from
  `graphOrdinalMapChecksum`, and the Python executor validates the latter against the dense
  `(graphOrdinal, graphNodeKey)` rows. Temporary Parquet write/readback fixture retains an
  isolated vertex and verifies the cross-language TypeScript checksum golden. Focused graph
  suite: 16/16 passed. No current-source artifact was rebuilt or promoted. Audit also found the
  old checked-in artifact labeled the candidate-map checksum as `ordinalMapChecksum`; its value
  (`86fee5…`) does not match the recomputed graph map (`4319a5…`), so that ambiguous legacy
  manifest now fails closed.
- [ ] **GPU-EXP-15** bounded multi-hop traversal with predecessor/path receipt;
  depth policy is 2 normally, 3 expanded, 4 hard maximum.
  Implementation progress (2026-09-23): the 8098 BFS request now encodes DEFAULT=2,
  EXPANDED=3, MAXIMUM=4, validates requests against the selected bound, reconstructs node-key
  paths from predecessor ordinals, and emits a checksummed noncanonical path receipt bound to
  graph revision, projection revision, and the explicit graph-ordinal-map checksum. Missing or
  malformed bindings fail closed. Unit coverage exercises policy rejection, predecessor-chain
  validation, receipt checksum revision sensitivity, and runtime response propagation (20 focused
  Python tests passed on 2026-09-23).
  **Still open:** live traversal against one admitted frozen graph; `/v1/graph/resident` currently
  reports `resident:null`, and the available old artifact has the checksum ambiguity recorded
  under GPU-EXP-14. No synthetic graph was loaded into the live GPU service.
- [ ] **GPU-EXP-16** NetworkX oracle → cuGraph executor parity, including any
  internal renumbering translation and deterministic replay. **Partial fixture proof (2026-09-23):**
  the BFS adapter is tested against NetworkX shortest paths with deliberately permuted executor
  ordinals; translated node-key paths match and replayed path checksums are identical. This uses a
  fake cuGraph result frame and proves adapter mapping/determinism only, not cuGraph computation or
  live parity. Full task remains open pending replay on the same admitted frozen graph artifact.

GPU cache, HNSW, QLoRA, and 4D coordinate tasks remain owned by their existing
OpenSpecs. A graph result is derived evidence and cannot become CandidateOrdinal,
canonical identity, or an additional retrieval vote.
