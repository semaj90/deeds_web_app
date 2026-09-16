## Why

`parent-atlas-gpu-mini-fabric-01` proved exact-vs-approximate retrieval (Phase A/B) and structural
graph traversal (Phase D) each against a CPU or vendor-exact oracle, but explicitly deferred
`BITFROST-SIM-01`/`BITFROST-LOD-01` (ACE/BitFrost residency prediction) as a staged follow-up —
its own design.md Decision 5 says this logical residency policy must be proven correct *before* any
CUDA/L2/radix implementation work (`CUTILE-ACE-01`, `BITFROST-L2-01`) is worth attempting, since
those later phases have nothing to optimize if the utility formula underneath them doesn't actually
predict cache reuse. That parent change's specs directory already contains a design-only spec
(`atlas-ace-residency-simulation/spec.md`) for this capability — this change turns that spec into a
real, falsifiable, running proof.

## What Changes

- Design and implement a deterministic query-sequence generator over `GraphFixtureV1`'s existing
  10K-node/50K-edge adjacency (`python/atlas_compute/gpu_mini_fabric/graph_fixture.py`, already
  built and proven in the parent change) — resolves the Open Question the parent change left
  unanswered, rather than inventing an unrelated third synthetic graph.
- Implement `AtlasAceResidencyV1`: pure-logic (no CUDA) utility scoring + hot/warm/cold prediction
  simulation, named to avoid the NVIDIA cuVS "ACE" (Augmented Core Extraction) collision per root
  CLAUDE.md's naming rule and the parent change's Decision 6.
- Implement the LOD promotion/demotion ladder (identity → glyph → latent64 → latent128 →
  semantic768 → structural → source → prompt-ready) as a strictly-ordered state machine layered on
  top of the residency simulation.
- Run a real, seeded simulation against the fixed query trace and produce a
  `docs/reports/bitfrost-sim-01-*.json` receipt reporting `hitRate`, `precisionOfPrefetch`,
  `bytesPromoted`, `bytesWasted`, `promotionLatency`, `evictionRate`, and `queryLatencyDelta` — the
  full metric set the parent spec requires, not hit-rate alone.
- Gate success on the parent design's oracle-first principle applied without a CUDA oracle: the
  falsifiable bar is "does the utility score predict actual next-query reuse of promoted
  neighbors", proven empirically against the fixed trace, not asserted from plausible-looking
  numbers.

## Capabilities

### New Capabilities
- `atlas-ace-residency-simulation`: `AtlasAceResidencyV1` utility scoring, hot/warm/cold prediction
  simulation, and the query-sequence-trace-based falsifiability gate. (A design-only version of
  this spec already exists under `parent-atlas-gpu-mini-fabric-01/specs/`; this change is what
  actually implements and proves it — the spec file here supersedes that one as the implemented
  version of the same capability.)
- `atlas-lod-promotion-ladder`: the strictly-ordered identity→prompt-ready LOD promotion/demotion
  state machine and its skipped-rung rejection/override-logging behavior.

### Modified Capabilities
(none — nothing in `openspec/specs/` yet defines these capabilities as implemented)

## Impact

- New code only, under a new `python/atlas_compute/gpu_mini_fabric/bitfrost_sim/` (or similarly
  scoped) package — no existing production code path is modified.
- No CUDA, no GPU device access, no canonical Postgres/Qdrant/Redis/Neo4j reads or writes. Pure
  Python simulation over the existing frozen `GraphFixtureV1` fixture.
- Unblocks (does not implement) the next staged tranche in the parent change's sequence:
  `SOM-CACHE-01` (section 8, needs a working residency/LRU/graph-neighbor baseline to tournament
  against) and `BITFROST-L2-01` (section 10, explicitly gated on this logical policy being proven
  first per parent design.md Decision 5).
