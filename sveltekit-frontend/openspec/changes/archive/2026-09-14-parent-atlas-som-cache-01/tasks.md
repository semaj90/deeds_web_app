## 1. Structural feature vectors (atlas-structural-som-features)

- [x] 1.1 Audit `python/atlas_compute/gpu_mini_fabric/` for anything already resembling a
      structural-feature-vector builder before writing a new one (Duplication Prevention rule)
      **Confirmed**: `rg -li "som|kohonen|feature_vector|bmu"` matched only false-positive
      substrings ("somehow", "somewhere") — no existing implementation.
- [x] 1.2 Build `StructuralFeatureVectorV1` computation from `GraphFixtureV1`'s edge lists
      (`log1p(out_degree)`, `log1p(in_degree)`, per-edge-type fraction for CALLS/IMPORTS/
      REFERENCES/IMPLEMENTS/TESTS) — 7-dim, deterministic
      **Landed**: `python/atlas_compute/gpu_mini_fabric/atlas_som_lite_v1.py`,
      `build_structural_features_v1()`.
- [x] 1.3 Verify determinism: regenerate feature vectors twice from the same fixture, assert
      byte-identical (or exact float-equal) output
      **Verified live**: `PYTHONPATH=. python -m atlas_compute.gpu_mini_fabric.atlas_som_lite_v1`
      — "structural feature vectors are deterministic (byte-identical regeneration confirmed)".

## 2. CPU-only SOM training (atlas-structural-som-features)

- [x] 2.1 Implement a small (10×10 grid) Kohonen SOM trainer: fixed seed, fixed epoch count, fixed
      learning-rate/neighborhood-radius decay schedule, sequential (non-shuffled) training order
      per design.md Decision 2
      **Landed**: same file, `train_structural_som_v1()`. `GRID_ROWS=GRID_COLS=10`,
      `NUM_EPOCHS=20`, `SOM_SEED=20260915`, linear learning-rate/radius decay, plain CPython/numpy
      (no CUDA import anywhere in the module).
- [x] 2.2 Verify determinism: train twice with the same seed/fixture, assert identical BMU-grid
      assignment for every node
      **Verified live**: same run — "SOM training is deterministic (identical BMU-grid assignment
      confirmed)".
- [x] 2.3 Build the reverse index (`grid_cell -> list[nodeKey]`) and the Chebyshev-radius-1
      SOM-BMU-neighbor lookup (design.md Decision 5)
      **Landed**: `AtlasStructuralSomV1.cell_to_nodes` + `.som_bmu_neighbors()`, returning
      `(neighbor_key, "SOM_NEIGHBOR")` tuples matching `AtlasAceResidencyV1`'s expected
      `(neighbor_key, edge_type)` shape.

## 3. AtlasAceResidencyV1 pluggable neighbor strategy (atlas-ace-residency-simulation, ADDED)

- [x] 3.1 Add the optional `neighbor_provider` constructor parameter to `AtlasAceResidencyV1`,
      defaulting to `None` (existing graph-adjacency behavior when omitted)
      **Landed**: `atlas_ace_residency_v1.py` — `NeighborProvider` type alias, optional
      `neighbor_provider` constructor param, `run()` branches on `is not None`.
- [x] 3.2 Verify backward compatibility: re-run `parent-atlas-bitfrost-sim-01`'s existing
      `bitfrost_sim_01.py` gate script unmodified and confirm identical `observed_lift` (0.53425) —
      proves the refactor did not change existing behavior
      **Verified live**: re-ran `bitfrost_sim_01.py` (which does not pass `neighbor_provider`)
      after the refactor — `observed_lift: 0.53425`, byte-identical to the pre-refactor value.
      `test_atlas_lod_ladder_v1.py`'s 5 tests also still pass unmodified.
- [x] 3.3 Add the `"SOM_NEIGHBOR"` entry to `EDGE_TYPE_WEIGHT` with its own documented fixed weight
      (not silently falling back to the TESTS-tier weight)
      **Landed**: `EDGE_TYPE_WEIGHT["SOM_NEIGHBOR"] = 0.5`.

## 4. The 4-way tournament (parent-atlas-som-cache-tournament)

- [x] 4.1 Build `som_cache_tournament_01.py`: load the same `query_sequence_fixture.py` locality
      trace used by every strategy (per spec's "not independently-generated sequences" requirement)
      **Landed**: `python/atlas_compute/gpu_mini_fabric/som_cache_tournament_01.py` — single
      `trace = query_fixture.locality_trace` shared across all four strategy runs.
- [x] 4.2 Run `no-prefetch` (`utility-score` eviction, empty neighbor provider)
- [x] 4.3 Run `plain-LRU` (`lru` eviction, empty neighbor provider)
- [x] 4.4 Run `graph-neighbor` (`utility-score` eviction, the existing graph-adjacency default —
      reusing, not re-deriving, `parent-atlas-bitfrost-sim-01`'s proven result)
- [x] 4.5 Run `SOM-BMU-neighbor` (`utility-score` eviction, the SOM-BMU-neighbor provider from
      task 2.3)
      **Real bug found and fixed before this could run at all**: the first attempt (uncapped
      radius-1 SOM neighbors) had to be killed after running >3 minutes with zero output — a 10×10
      grid over 10,000 nodes averages ~100 nodes/cell, so a radius-1 (9-cell) window averaged ~900
      candidate "neighbors" per query, versus graph-neighbor's ~5 average out-degree. Not just a
      performance problem — an unfair, meaningless comparison (promoting ~900 nodes per query is
      "promote nearly everything", not prefetch). Fixed by capping `som_bmu_neighbors()` to
      `MAX_SOM_NEIGHBORS=5` (matching `GraphFixtureV1`'s exact average out-degree: 50,000/10,000),
      deterministically prioritizing same-cell nodes before radius-1-ring nodes, sorted by
      `node_key` (never dict/set iteration order). Re-run completed in well under the timeout
      after the fix.
- [x] 4.6 Compute the verdict: does SOM-BMU-neighbor's `hitRate` exceed BOTH graph-neighbor's and
      plain-LRU's `hitRate`? Record PASS (recommend for next real-data validation) or FAIL (stays
      `STEP-08 experimental`) explicitly in the result artifact — per spec, not a vibe judgment.
      **Result (real, run on this host, plain CPython, no CUDA — verified deterministic across
      `PYTHONHASHSEED=777` vs. default, identical verdict values both times)**:
      ```
      no-prefetch:        hitRate=0.05825  precisionOfPrefetch=0.0
      plain-LRU:          hitRate=0.05875  precisionOfPrefetch=0.0
      graph-neighbor:     hitRate=0.6145   precisionOfPrefetch=0.588
      SOM-BMU-neighbor:   hitRate=0.05725  precisionOfPrefetch=0.00075
      ```
      **Verdict: `STAYS_STEP_08_EXPERIMENTAL`** — SOM-BMU-neighbor did not beat graph-neighbor
      (0.05725 vs 0.6145) or plain-LRU (0.05725 vs 0.05875, actually slightly *below* it). This is
      a real, explainable, falsifiable result, not an implementation defect: the query-sequence
      trace follows actual graph out-edges (`LOCALITY_PROBABILITY=0.6`), so graph-neighbor
      prefetch predicts next-query reuse directly by construction. The SOM was trained on
      *structural* similarity (out-degree/in-degree/edge-type distribution) — nodes with similar
      structural roles are not the nodes the random walk actually visits next, so SOM-BMU-neighbor
      prefetch has essentially no more signal than no-prefetch at all. All three no-real-locality-
      signal strategies (no-prefetch, plain-LRU, SOM-BMU-neighbor) cluster tightly around a ~5.7-5.9%
      noise floor, while graph-neighbor — the only strategy that actually encodes the trace's real
      locality structure — reaches 61.45%.
- [x] 4.7 Produce `docs/reports/som-cache-tournament-01-result.json` with all four strategies' full
      metric sets, the structural feature-vector composition, the SOM training config, and the
      verdict
      **Result: `docs/reports/som-cache-tournament-01-result.json`.**

## 5. Documentation and handoff

- [x] 5.1 Record the real verdict and any surprising findings in this tasks.md
      **Recorded above (task 4.6)**. Notable finding for anyone reading this later: this result
      does NOT mean "SOM prefetch is a bad idea in general" — it means a SOM trained on *purely
      structural* graph features has no reason to predict a random walk that follows real edges,
      since edge-following IS the locality signal, and the SOM was never given edge information as
      input (design.md Decision 1's own flagged risk: "SOM may just re-derive graph structure less
      directly" — the real result is actually starker than that risk anticipated: SOM's structural
      features carry ~zero next-query-reuse signal for an edge-following trace). A fairer future
      test of SOM's real value proposition would need either (a) a query trace with locality
      structure SOM's own features actually predict (e.g. one that clusters by structural role, not
      by edge-adjacency), or (b) real `semantic_768`-derived SOM features once available (this
      change's own deferred Open Question) — this result specifically falsifies
      "structural-feature SOM beats edge-following on an edge-following trace", not SOM prefetch as
      a general concept.
- [x] 5.2 Do NOT start `BITFROST-L2-01` or any CUDA work in this change — confirm it stays
      separately staged, matching this change's own Non-Goals
      **Confirmed**: no CUDA, no `cudaAccessPropertyPersisting`, no GPU code written in this
      change. `BITFROST-L2-01` remains a separately staged follow-up.

## 6. Follow-up — FIXED (2026-09-14, post-archive review)

- [x] 6.1 **`som_bmu_neighbors()`'s within-ring capping was name-sorted, not distance-ranked —
      fixed.** `MAX_SOM_NEIGHBORS=5` truncation previously picked same-cell nodes first (ring 0),
      then ring-1 nodes, each ring ordered by `sorted(node_key)` — an arbitrary lexicographic
      tie-break, not the actual 5 nearest neighbors by feature-vector (Euclidean) distance to the
      queried node's own feature vector. **Fix landed**: `AtlasStructuralSomV1` now carries
      `feature_vectors: dict[str, np.ndarray]` (populated in `train_structural_som_v1()`), and
      `som_bmu_neighbors()` gathers all ring0+ring1 candidates, ranks them by real squared
      Euclidean distance to the query node's own feature vector (ascending, `node_key` tie-break
      on exact ties), then truncates to `MAX_SOM_NEIGHBORS`. No Hilbert curve or Hamming distance
      was used or is appropriate here — a Hilbert curve solves a different problem (1D cache/disk
      locality for spatial indexes, not neighbor ranking), and Hamming distance applies to
      bit-vector/quantized codes, not this SOM's continuous 7-dim feature vectors. Plain Euclidean
      distance-ranking is the correct, standard SOM-neighbor technique and is what was implemented.
- [x] 6.2 Re-ran the tournament after the fix (`PYTHONPATH=. python -m
      atlas_compute.gpu_mini_fabric.som_cache_tournament_01`). **Real result: the fix measurably
      helped, but did not flip the verdict.**
      ```
      Before fix:  SOM-BMU-neighbor hitRate=0.05725  (below BOTH no-prefetch 0.05825 and plain-LRU 0.05875)
      After fix:   SOM-BMU-neighbor hitRate=0.061     (now ABOVE no-prefetch 0.05825 and plain-LRU 0.05875)
      graph-neighbor (unchanged, not touched by this fix): hitRate=0.6145
      ```
      `som_beats_plain_lru` flipped from `false` to `true` — confirming the original capping bug
      was a real, measurable defect, not just a theoretical one. `som_beats_graph_neighbor` is
      still `false` (0.061 vs 0.6145 — nowhere close), so the overall verdict is unchanged:
      **`STAYS_STEP_08_EXPERIMENTAL`**. Updated result: `docs/reports/som-cache-tournament-01-result.json`.
