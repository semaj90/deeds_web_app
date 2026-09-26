## Why

`parent-atlas-bitfrost-sim-01` proved `AtlasAceResidencyV1`'s graph-neighbor prefetch beats a
same-frequency control (real lift 0.53425), but also surfaced a real finding that changes what
"beating the baseline" even means: on a high-node-diversity trace, the utility-score eviction mode
converges almost exactly with plain LRU (hitRate 0.6145 vs 0.61475). `SOM-CACHE-01`
(`parent-atlas-gpu-mini-fabric-01` section 8) was staged specifically to settle whether a
SOM-BMU-neighbor prefetch strategy earns production consideration — and per that change's own spec,
it only does if it beats **both** graph-neighbor prefetch and plain LRU, not just a no-prefetch
strawman. Now that the residency harness and its eviction-mode pluggability exist and are proven,
this change runs that tournament for real.

## What Changes

- Build a deterministic, CPU-only (no CUDA) structural feature vector per `GraphFixtureV1` node
  (out-degree, in-degree, edge-type distribution) — `GraphFixtureV1` carries no embeddings, so this
  is a self-contained synthetic input for training a SOM, not a claim about production
  `embeddinggemma` vectors.
- Train a small Kohonen SOM (self-organizing map) over these feature vectors, CPU-only, fully
  deterministic (fixed seed, no per-epoch shuffling), resolving the parent change's "GPU vs
  CPU-only SOM training" Open Question in favor of CPU-only for this proving-ground fixture.
- Refactor `AtlasAceResidencyV1` (from `parent-atlas-bitfrost-sim-01`) to accept a pluggable
  neighbor-selection strategy, backward-compatible with its existing graph-adjacency default, so a
  4th (SOM-BMU-neighbor) and a null (no-prefetch) strategy can run through the exact same harness
  rather than duplicating it.
- Run all four strategies (no-prefetch, plain LRU, graph-neighbor, SOM-BMU-neighbor) against the
  identical query-sequence trace (reusing `query_sequence_fixture.py`'s locality trace — same trace
  for all four, per the parent spec's explicit "not independently-generated sequences" requirement).
- Produce a verdict: SOM-BMU-neighbor is recommended for anything beyond `STEP-08 experimental`
  status only if its hit rate exceeds both graph-neighbor and plain-LRU; otherwise the result
  artifact says so explicitly and SOM stays experimental.

## Capabilities

### New Capabilities
- `parent-atlas-som-cache-tournament`: the 4-way prefetch-strategy tournament and its
  win-both-baselines promotion gate. (A design-only version of this spec already exists under
  `parent-atlas-gpu-mini-fabric-01/specs/`; this change is what actually implements and proves it.)
- `atlas-structural-som-features`: the deterministic structural feature vector + CPU-only SOM
  training used as the SOM strategy's input, kept as its own capability since it is reusable beyond
  this one tournament (any future BitFrost SOM-routing work needs the same feature contract).

### Modified Capabilities
- `atlas-ace-residency-simulation`: adds a pluggable neighbor-selection-strategy parameter to
  `AtlasAceResidencyV1`, backward-compatible with the existing graph-adjacency-only behavior (no
  existing requirement's behavior changes for a caller that doesn't pass a strategy).

## Impact

- New code under `python/atlas_compute/gpu_mini_fabric/` — `atlas_som_lite_v1.py` (feature vectors +
  SOM training) and `som_cache_tournament_01.py` (the runner).
- `atlas_ace_residency_v1.py` (from the prior change) gains an optional constructor parameter;
  `bitfrost_sim_01.py`'s existing call sites are unaffected (they don't pass the new parameter, so
  keep their original graph-adjacency behavior unchanged).
- No CUDA, no GPU device access, no canonical production data, in this change either.
