## Context

`parent-atlas-bitfrost-sim-01` built and proved `AtlasAceResidencyV1` (HOT/WARM/COLD tiers,
recency-weighted utility scoring, graph-neighbor prefetch promotion) with a real locality-lift PASS
(0.53425) and a real finding: on a high-node-diversity trace, plain LRU eviction converges almost
exactly with the utility-score formula (hitRate 0.61475 vs 0.6145). That change's own design.md
explicitly flagged this as a constraint the SOM tournament must account for — a SOM strategy needs
to beat LRU specifically, not just a no-prefetch strawman, which is also exactly what
`parent-atlas-gpu-mini-fabric-01`'s original `parent-atlas-som-cache-tournament` spec already
requires ("exceeds both the graph-neighbor-prefetch and plain-LRU baselines").

`GraphFixtureV1` carries no per-node embeddings — it is purely structural (nodeKey identity + typed
edges). A SOM needs *some* vector input to train on. This design resolves that gap and the parent
change's "GPU vs CPU-only SOM training" Open Question.

## Goals / Non-Goals

**Goals:**
- Resolve the SOM-training-input gap with a self-contained, deterministic structural feature
  vector — never conflated with real production `embeddinggemma` semantic vectors.
- Resolve the parent's Open Question: CPU-only SOM training for this fixture.
- Refactor `AtlasAceResidencyV1` for pluggable neighbor-selection strategies without breaking its
  existing caller (`bitfrost_sim_01.py`) or duplicating the harness.
- Run the real 4-way tournament and produce a real, falsifiable verdict on SOM promotion.

**Non-Goals:**
- Do not train a SOM on real production `codebase_chunk_index.content_embedding` vectors — this
  stays a synthetic-fixture proving ground, per the parent change's Non-Goals.
- Do not implement `BITFROST-L2-01`'s CUDA L2 benchmarking here (separate change, separate
  environment requirement).
- Do not wire any tournament winner into production BitFrost policy — a promotion decision from
  this synthetic fixture is a recommendation for the next real-data validation step, not a
  production cutover.

## Decisions

### 1. Structural feature vector, not a real embedding, as the SOM's training input
Each node's feature vector is `[log1p(out_degree), log1p(in_degree), frac_CALLS, frac_IMPORTS,
frac_REFERENCES, frac_IMPLEMENTS, frac_TESTS]` (7-dim), computed deterministically from
`GraphFixtureV1`'s existing edge lists — no new fixture, no cross-change coupling to Phase B's
`semantic_768` export (whose node identities don't even overlap with `GraphFixtureV1`'s synthetic
`gpu-graph-struct:node:NNNNN` keys). Labeled explicitly as `StructuralFeatureVectorV1` in code and
result artifacts so nobody mistakes this for a claim about real semantic embeddings.

**Alternative considered**: fold in the Phase D `GRAPH-PAGERANK-01` authority score as an 8th
feature. Rejected for v1 — adds cross-change coupling to test a narrower question (does
SOM-neighbor structure beat graph-adjacency structure for prefetch) that doesn't need it; a future
revision can add it if the plain structural feature vector turns out insufficiently discriminative.

### 2. CPU-only Kohonen SOM training, fully deterministic (no per-epoch shuffling)
Resolves the parent's Open Question. A small (10×10) grid, fixed epoch count, fixed
learning-rate/neighborhood-radius decay schedule, fixed seed, and sequential (unshuffled) training
order — the last point is a deliberate simplicity trade-off over a more typical shuffled-SGD SOM
trainer, prioritizing reproducibility (a training that reorders samples per epoch would need a
second seeded RNG stream and would still need to prove determinism itself) over faithfully
replicating a specific published SOM training recipe. This is consistent with this whole proving
ground's "no CUDA needed for the logic-correctness questions" theme (parent design.md Decision 5)
— SOM quality-at-scale is not what's under test here, whether SOM-neighbor structure is a *better
prefetch signal than graph adjacency* is.

**Alternative considered**: GPU-accelerated SOM training (e.g. via `atlas-rapids-cu13`'s CuPy).
Rejected for this change — no accuracy or scale requirement here demands GPU (10,000 nodes × 7 dims
is trivially small), and pure CPU keeps the whole tournament portable across any Python
environment, matching `parent-atlas-bitfrost-sim-01`'s own no-CUDA precedent.

### 3. `AtlasAceResidencyV1` gets a pluggable neighbor-selection strategy, not a duplicated harness
Add an optional constructor parameter, `neighbor_provider: Callable[[str], list[tuple[str, str]]]
| None = None`. When `None` (the existing caller's default), behavior is byte-for-byte identical to
the prior change — `self.adjacency_with_types.get(node_key, [])`. When provided, `run()` calls
`neighbor_provider(node_key)` instead. This lets `no-prefetch` (`lambda _: []`), `graph-neighbor`
(the existing default, passed explicitly for clarity), and `som-bmu-neighbor` (a new provider
built from the trained SOM's BMU-adjacency) all execute through the *same* promotion/eviction/
LOD-ladder code, per this repo's Duplication Prevention rule and the parent change's own explicit
intent ("reusable by the future `SOM-CACHE-01` tournament").

A synthetic edge-type-like label `"SOM_NEIGHBOR"` is used for SOM-provided neighbors so the existing
`EDGE_TYPE_WEIGHT` lookup mechanism (used for the promotion utility increment) keeps working
unmodified — given its own documented fixed weight, not silently defaulting to the TESTS-tier
fallback weight.

**Alternative considered**: write a second, SOM-specific residency simulator class. Rejected —
this is exactly the "duplicate a harness that's designed for reuse" mistake the parent change's
design explicitly built the LRU-eviction-mode flag to avoid; extending it once more is the correct
continuation of that same decision, not a new one.

### 4. "no-prefetch" vs "plain LRU" are two distinct baselines, not the same thing twice
Per the original `parent-atlas-som-cache-tournament` spec's four named strategies:
- **no-prefetch**: `eviction_mode="utility-score"`, `neighbor_provider=lambda _: []` — isolates
  "does caching alone (with the more sophisticated eviction formula) help, absent any prefetch."
- **plain LRU**: `eviction_mode="lru"`, `neighbor_provider=lambda _: []` — the classic
  industry-standard baseline, no prefetch, simplest possible eviction.
- **graph-neighbor**: `eviction_mode="utility-score"`, `neighbor_provider=`(graph adjacency, the
  prior change's default) — the already-proven `parent-atlas-bitfrost-sim-01` strategy.
- **SOM-BMU-neighbor**: `eviction_mode="utility-score"`, `neighbor_provider=`(SOM-BMU adjacency).

All four share `eviction_mode="utility-score"` except plain LRU, which is deliberately the one
axis-crossed baseline included precisely because the prior change found utility-score and LRU
nearly converge — plain LRU is the harder baseline to beat, not a redundant restatement of
no-prefetch.

### 5. SOM-BMU-neighbor definition: same-or-adjacent grid cell, Chebyshev radius 1, CAPPED at 5
A node's "SOM neighbors" are drawn from other nodes whose BMU (best-matching-unit) grid cell is
within Chebyshev distance 1 of the queried node's own BMU cell (the node's own cell's other
occupants, plus the 8 surrounding cells) — the direct 2D analogue of "graph adjacency" in SOM-grid
space. Computed via a reverse index (`grid_cell -> list[nodeKey]`) built once after training, not
recomputed per query.

**CORRECTED (2026-09-14, real run)**: the initial implementation returned the *entire* radius-1
window uncapped. On the 10×10 grid over 10,000 nodes, that averages ~100 nodes/cell → ~900
candidates per query in a 9-cell window — found by actually running it: the tournament script had
to be killed after running past 3 minutes with zero output. This was not merely a performance bug;
it made the comparison meaningless (promoting ~900 nodes per query approaches "promote nearly
everything," which is not prefetch in any useful sense, and is wildly unfair against
graph-neighbor's ~5 average out-degree). **Fixed**: `som_bmu_neighbors()` now caps its output at
`MAX_SOM_NEIGHBORS=5` — matching `GraphFixtureV1`'s exact average out-degree (50,000 edges /
10,000 nodes) — prioritizing same-cell nodes (ring 0) before radius-1-ring nodes (ring 1), with a
deterministic `sorted(node_key)` tie-break at each ring (never relying on dict/set iteration order,
per the hash-randomization lesson from `parent-atlas-bitfrost-sim-01`). This makes the tournament
measure neighbor-selection *quality* (which 5 neighbors get promoted) rather than neighbor-set
*size* — the actual question `SOM-CACHE-01` exists to answer.

## Risks / Trade-offs

- **[Risk]** A 7-dim purely-structural feature vector may not produce a SOM topology that's
  meaningfully different from graph adjacency (out-degree/in-degree/edge-type-mix is itself derived
  from the same graph), which could make this tournament unable to distinguish "SOM adds value" from
  "SOM just re-derives graph structure less directly." → **Mitigation**: this is itself a legitimate,
  falsifiable finding to report, not a flaw to engineer around — if SOM-BMU-neighbor performs
  similarly to graph-neighbor because they're built from correlated inputs, that is exactly the kind
  of result this tournament exists to surface, and the result artifact records the feature-vector
  composition alongside the verdict so this interpretation is available to any reviewer.
- **[Risk]** The unshuffled deterministic SOM training order (Decision 2) may bias the learned
  topology toward the fixed `node_keys` iteration order. → **Mitigation**: `GraphFixtureV1`'s
  `node_keys` order is itself arbitrary (`gpu-graph-struct:node:00000..09999`, unrelated to any
  structural property), so this is a fixed-but-arbitrary bias, not a systematic one favoring any
  particular feature-vector region — acceptable for this proving ground's purpose.
- **[Trade-off]** Extending `AtlasAceResidencyV1`'s constructor (Decision 3) technically changes a
  capability (`atlas-ace-residency-simulation`) archived by the prior change — handled as a
  backward-compatible `ADDED` requirement (a new optional capability, not a `MODIFIED` behavior
  change) since the default `None` case is byte-identical to the existing behavior.

## Migration Plan

No production migration — pure-Python simulation code, zero canonical-data impact, and the one
modified file (`atlas_ace_residency_v1.py`) keeps its existing default behavior unchanged for its
existing caller.

## Open Questions

- Whether a future revision should feed the SOM real `semantic_768`-derived features once a
  node-identity mapping exists between `GraphFixtureV1` and the real embedding corpus — explicitly
  deferred (see Decision 1's alternative-considered note).
- **RESOLVED by the real tournament run (2026-09-14)**: the Risks section's first flagged risk
  ("SOM may just re-derive graph structure less directly") did not materialize as described — the
  actual result is starker. SOM-BMU-neighbor (hitRate 0.05725) performed statistically
  indistinguishable from no-prefetch (0.05825) and plain-LRU (0.05875), while graph-neighbor reached
  0.6145. `STAYS_STEP_08_EXPERIMENTAL` per the spec's gate. This is a real, explainable finding
  (structural features carry no information about which edges the trace actually follows), not an
  implementation defect — see tasks.md 4.6/5.1 for the full result and its correct interpretation
  scope (it falsifies "structural-feature SOM beats edge-following on an edge-following trace,"
  not SOM prefetch as a general concept).
