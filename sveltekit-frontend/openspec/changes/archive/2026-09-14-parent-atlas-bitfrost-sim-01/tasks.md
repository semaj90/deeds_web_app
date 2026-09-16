## 1. Query-sequence generation (resolves the parent change's Open Question)

- [x] 1.1 Audit `python/atlas_compute/gpu_mini_fabric/` for anything already resembling a
      query-sequence/random-walk generator before writing a new one (Duplication Prevention rule)
      **Confirmed**: `rg -li "random_walk|query_sequence|locality"` over `python/atlas_compute/`
      returned zero hits — no existing generator to reuse.
- [x] 1.2 Build `query_sequence_fixture.py`: load `GraphFixtureV1` via `generate_graph_fixture_v1()`
      (reuse — do not build a new graph), implement the seeded biased-random-walk generator
      (`TRACE_LENGTH`, `LOCALITY_PROBABILITY`, fixed seed as named constants per design.md
      Decision 2)
      **Landed**: `python/atlas_compute/gpu_mini_fabric/query_sequence_fixture.py`
      (`TRACE_LENGTH=4000`, `LOCALITY_PROBABILITY=0.6`, `SEED=20260914`, distinct from
      `GraphFixtureV1`'s own `SEED=20260901`). Adjacency built from `fixture.edge_src`/`edge_dst`
      as an outgoing-edge map keyed by `nodeKey` string, never a row index.
- [x] 1.3 Implement the shuffled-control-trace derivation (`rng.permutation()` of the locality
      trace, same seed lineage)
      **Landed**: same function, `rng.permutation(np.array(locality_trace, dtype=object))`,
      drawing from the same `rng` instance (continued seed lineage, not a fresh reseed).
- [x] 1.4 Verify determinism: regenerate both traces twice with the same seed, assert
      byte-identical `nodeKey` sequences
      **Verified live**: `PYTHONPATH=. python -m atlas_compute.gpu_mini_fabric.query_sequence_fixture`
      — "query-sequence fixture is deterministic (byte-identical regeneration confirmed)". Plain
      CPython (no CUDA env needed) — `locality_trace_checksum`/`control_trace_checksum` matched
      across two independent generations.
- [x] 1.5 Verify the control trace's node-visit multiset exactly matches the locality trace's
      **Verified live**: same run — "control trace multiset matches locality trace multiset"
      (`sorted(locality_trace) == sorted(control_trace)` assertion passed).

## 2. AtlasAceResidencyV1 — utility scoring, promotion, eviction

- [x] 2.1 Implement the `AtlasAceResidencyV1` tier model (HOT/WARM/COLD, bounded capacities as
      named constants) per design.md Decision 3
      **Landed**: `python/atlas_compute/gpu_mini_fabric/atlas_ace_residency_v1.py`.
      `HOT_CAPACITY=100`, `WARM_CAPACITY=500` (COLD implicit — everything not tracked in either set).
- [x] 2.2 Implement recency-weighted utility scoring for tier promotion (not pure frequency, per
      Decision 3's rejected-alternative rationale)
      **Landed**: `_utility()` = `visit_count * (RECENCY_DECAY ** age)`, `RECENCY_DECAY=0.98`.
- [x] 2.3 Implement graph-neighbor WARM promotion on each query, weighted by edge type
      (CALLS/IMPORTS weighted higher than TESTS — documented, fixed weights)
      **Landed**: `EDGE_TYPE_WEIGHT` map (`CALLS`/`IMPORTS`=1.0, `REFERENCES`/`IMPLEMENTS`=0.6,
      `TESTS`=0.3), fed into the promoted neighbor's soft `visit_count` increment.
- [x] 2.4 Implement eviction as a config-selectable mode: `utility-score` (primary) and `lru`
      (baseline, reusable by the future `SOM-CACHE-01` tournament) through the same harness
      **Landed**: `eviction_mode: Literal["utility-score", "lru"]` constructor arg; both modes run
      through the identical `_insert_hot`/`_insert_warm`/`_evict_lowest_utility` code path, differing
      only in `_utility()`'s formula (LRU mode returns `last_touched_step` alone).
- [x] 2.5 Implement the nominal per-LOD-rung byte-size table (design.md Decision 4) and wire it
      into `bytesPromoted`/`bytesWasted` computation
      **Landed**: `LOD_BYTE_SIZES` in `atlas_lod_ladder_v1.py` (identity=32B ... prompt_ready=32768B),
      wired via `AtlasLodLadderV1.byte_size_of()`.
- [x] 2.6 Compute and report all seven required metrics: `hitRate`, `precisionOfPrefetch`,
      `bytesPromoted`, `bytesWasted`, `promotionLatency`, `evictionRate`, `queryLatencyDelta`
      **Landed**: `AtlasAceResidencyResultV1.to_dict()` — all seven present.
      **Real bug found and fixed during first live run**: `_insert_warm()`'s eviction path called
      `self.warm.discard(victim)` *before* `self._remove_from_tiers(victim, step)`, so
      `_remove_from_tiers`'s own `was_resident = node_key in self.hot or node_key in self.warm`
      check always saw the victim as already gone and silently skipped counting the eviction —
      `evictionRate` was `0.0` and `bytesWasted` was `0` on the first run despite 8,284 unique nodes
      touched against a 600-slot combined HOT+WARM capacity (verified live: final hot/warm sizes
      were exactly at capacity, so evictions were clearly happening, just not being counted). Fixed
      by removing the premature discard and letting `_remove_from_tiers` do its own membership
      check + discard atomically. Re-run after the fix: `evictionRate` became a real `4.86`
      (evictions per query, since one query can promote multiple neighbors each capable of
      triggering an eviction) and `bytesWasted` became real nonzero values (`~30.6M` locality vs
      `~35.2M` control) — internally consistent with the control trace wasting a *larger fraction*
      of its promoted bytes than the locality trace, since its promotions are less likely to be
      followed by an actual next-query hit. The `hitRate`/`lift` numbers were unaffected by this bug
      (tier-membership capacity enforcement was already correct; only the counting instrumentation
      was broken).
      **Second real bug found and fixed, this one a determinism bug**: re-running the same seeded
      gate script twice produced two DIFFERENT `observed_lift` values (`0.534` then `0.53425`) —
      caught only because this repo's own convention of re-running everything to check for
      determinism was followed, not assumed from a single run. Root cause: `_evict_lowest_utility()`
      called `min(tier_set, key=lambda k: self._utility(k, step))` over a plain `set[str]`; CPython
      randomizes string hash seeds per process (`PYTHONHASHSEED`), so `set` iteration order — and
      therefore which node `min()` picks on a utility tie — is non-deterministic across process
      runs. Fixed by adding `node_key` as a deterministic secondary sort key:
      `key=lambda k: (self._utility(k, step), k)`. Re-verified across three explicit
      `PYTHONHASHSEED` values (1, 2, 99999): all three produced the identical `observed_lift =
      0.53425` — confirmed fixed, not just "happened to match once."

## 3. AtlasLodLadderV1 — strict promotion/demotion ladder

- [x] 3.1 Implement the 8-rung ordered ladder (identity → glyph → latent64 → latent128 →
      semantic768 → structural → source → prompt-ready) as its own state machine, independent of
      the residency-tier state machine (design.md Decision 5)
      **Landed**: `python/atlas_compute/gpu_mini_fabric/atlas_lod_ladder_v1.py` — `LOD_RUNGS`,
      `AtlasLodLadderV1` class with its own `current_rung_index` dict, no coupling to
      `AtlasAceResidencyV1`'s HOT/WARM/COLD sets.
- [x] 3.2 Implement skip-rung rejection/override-logging: a promotion request skipping a rung
      either raises or logs an explicit `overrideReason`, never silently succeeds
      **Landed**: `request_transition()` — rejects (rung unchanged, `accepted=False`) when
      `skipped_rungs > 0` and no `override_reason` given; accepts and records the reason otherwise.
- [x] 3.3 Wire LOD-rung promotion to trigger from the same graph-neighbor-promotion event as WARM
      residency promotion (same trigger, independently validated state)
      **Landed**: `AtlasAceResidencyV1.run()` calls `self.ladder.promote_one_rung(node_key)` for the
      queried node itself and for every promoted neighbor, in the same loop iteration as the
      residency-tier promotion — but the two state dicts (`self.hot`/`self.warm` vs
      `self.ladder.current_rung_index`) are never cross-referenced for validation.
- [x] 3.4 Unit-test: a single-rung promotion succeeds without an override; a skipped-rung
      promotion is caught even when the corresponding residency promotion succeeds
      **Landed**: `python/tests/test_atlas_lod_ladder_v1.py` — 5 tests, all passing live
      (`pytest python/tests/test_atlas_lod_ladder_v1.py -v` → 5 passed). Includes
      `test_ladder_violation_detected_independently_of_residency_promotion_success`, which runs a
      real residency promotion to success then independently triggers and catches a skip-rung
      ladder violation on the same node.

## 4. Falsifiability gate — locality-lift comparison

- [x] 4.1 Run `AtlasAceResidencyV1` with identical config/seed against both the locality trace and
      its shuffled control (task 1) — record `hitRate` for each
      **Landed**: `python/atlas_compute/gpu_mini_fabric/bitfrost_sim_01.py` — fresh
      `AtlasAceResidencyV1` instance per trace (no state leakage between runs).
- [x] 4.2 Compute `hitRate(locality) - hitRate(control)` and compare against `MIN_LOCALITY_LIFT`
      (design.md Decision 1 — pick an initial small positive constant, e.g. 0.03, before the first
      real run)
      **Landed**: `MIN_LOCALITY_LIFT = 0.03` as a named module constant.
- [x] 4.3 Record the REAL observed lift from the first run in this tasks.md file and finalize
      `MIN_LOCALITY_LIFT` against that real number (matching the parent change's precedent of
      recalibrating its `topKOverlap` gate after seeing real data) — do not leave the constant as a
      guess once real data exists
      **Result (real, run on this host, plain CPython, no CUDA — numbers below are POST the
      determinism fix documented in task 2.6, i.e. stable across `PYTHONHASHSEED`)**:
      `hitRate(locality)=0.6145`, `hitRate(control)=0.08025`, **observed lift = 0.53425** —
      roughly 17.8× the 0.03 threshold. **Decision: `MIN_LOCALITY_LIFT` kept at `0.03`, not
      raised.** Rationale: 0.03 was already a deliberate, principled "guard against a fluke, not
      zero" floor (design.md Decision 1), not an arbitrary placeholder needing calibration toward
      the observed value — raising it toward 0.53425 after seeing that exact number would be
      overfitting the gate to one run rather than keeping it a meaningful floor for future
      parameter sweeps (e.g. a lower `LOCALITY_PROBABILITY` in a later run). This differs from the
      parent change's `topKOverlap` precedent (that gate was corrected because 1.0 was actively too
      strict for its own stated numerical-tolerance principle — 0.03 here has no analogous flaw).
      Both `control_trace_result.precisionOfPrefetch=0.001` (near-zero, as expected — no real
      adjacency signal) and `locality_trace_result.precisionOfPrefetch=0.588` further corroborate
      the residency policy is genuinely exploiting graph locality, not just node-popularity base
      rate.
- [x] 4.4 Produce the result artifact `docs/reports/bitfrost-sim-01-residency-gate.json` with: both
      traces' full metric sets, the computed lift, the nominal byte-size table used, the
      eviction-mode used, and a PASS/FAIL verdict
      **Result: PASS**. Report: `docs/reports/bitfrost-sim-01-residency-gate.json`.

## 5. LRU baseline comparison (built for reuse, not required for this change's own gate)

- [x] 5.1 Run the same locality trace through the `lru`-eviction-mode harness (task 2.4) as a
      baseline reference point
      **Landed**: `bitfrost_sim_01.py`'s `lru_baseline_mode` section.
- [x] 5.2 Record LRU's `hitRate`/`precisionOfPrefetch` alongside the utility-score run's numbers in
      the same result artifact, explicitly labeled as a reference baseline for the future
      `SOM-CACHE-01` tournament — not itself a pass/fail condition of this change
      **Result (real, same locality trace)**: LRU `hitRate=0.61475` vs utility-score
      `hitRate=0.6145` — nearly identical on this fixture/trace (LRU's pure-recency utility and the
      utility-score mode's recency-weighted-frequency formula converge closely when most nodes are
      visited only once or twice, which this trace's high node-diversity — 8,284 unique nodes
      touched against 600 cache slots — makes the common case). This convergence is itself a real,
      useful finding for the future `SOM-CACHE-01` tournament design: a graph-neighbor or
      SOM-BMU-neighbor strategy will need to show separation from LRU specifically because a naive
      utility-score formula does not reliably beat it on this kind of high-diversity trace.

## 6. Documentation and handoff

- [x] 6.1 Update this change's design.md Open Questions section with the real
      `TRACE_LENGTH`/`LOCALITY_PROBABILITY`/`MIN_LOCALITY_LIFT` values used, once task 4.3 lands
      **Landed**: design.md Open Questions section updated with the real lift result and the new
      LRU-convergence finding.
- [x] 6.2 Record in tasks.md whether `SOM-CACHE-01` (parent change section 8) can now proceed
      (this change's harness is the prerequisite it was waiting on) and whether `BITFROST-L2-01`
      (parent change section 10) is now unblocked per its own gating condition
      **`SOM-CACHE-01` (parent change section 8) is now unblocked**: `AtlasAceResidencyV1`'s logical
      residency policy is proven (real PASS, real lift 0.534), and its `lru`-eviction-mode +
      graph-neighbor-promotion harness is built reusably (task 2.4/5) — `SOM-CACHE-01`'s 4-way
      tournament (no-prefetch / LRU / graph-neighbor / SOM-BMU-neighbor) can now add a SOM-BMU
      strategy to this same harness rather than rebuilding it, and should specifically target
      beating LRU (not just no-prefetch), per the new finding recorded in design.md.
      **`BITFROST-L2-01` (parent change section 10) is now unblocked** per its own explicit gating
      condition ("Confirm `AtlasAceResidencyV1` logical policy is proven before starting") — that
      policy is proven PASS by this change.
- [x] 6.3 Do NOT start `SOM-CACHE-01` or `BITFROST-L2-01` implementation in this change — confirm
      they remain separately staged, matching this change's own Non-Goals
      **Confirmed**: no SOM code, no `cudaAccessPropertyPersisting`/L2 code, and no CUDA of any kind
      was written in this change. Both remain separately staged follow-up changes, per this
      change's own design.md Non-Goals.

## 7. Follow-up — FIXED (2026-09-14, post-archive gap review)

- [x] 7.1 **Real gap found: LOD demotion was never triggered.** The `atlas-lod-promotion-ladder`
      spec's own requirement is titled "LOD promotion/demotion follows the identity-to-prompt-ready
      ladder in order," and `AtlasLodLadderV1.request_transition()` mechanically supports moving
      down as well as up — but `AtlasAceResidencyV1` only ever called `promote_one_rung()`. A
      node's LOD rung grew monotonically for as long as it kept being queried/promoted, and never
      shrank back down even after falling all the way out of residency to COLD.
      **Fixed**: added `AtlasLodLadderV1.demote_one_rung()` (symmetric to `promote_one_rung()`,
      no-ops at rung 0), wired into `AtlasAceResidencyV1._remove_from_tiers()` — a full eviction to
      COLD now demotes the node's LOD rung one step, mirroring the promotion that happened on the
      way in. Added `python/tests/test_atlas_ace_residency_v1.py::
      test_full_eviction_demotes_lod_rung` — a real repro (force `HOT_CAPACITY=WARM_CAPACITY=1`,
      confirm a node promoted to `glyph` demotes back to `identity` after being fully evicted).
      **Verified no behavioral regression**: re-ran the `BITFROST-SIM-01` gate after the fix —
      `observed_lift` unchanged at exactly `0.53425`, `RESULT: PASS` — confirming LOD rung is a
      genuinely independent axis from HOT/WARM/COLD tier membership, as originally designed
      (design.md Decision 5's "validated independently" principle held even for this fix).
