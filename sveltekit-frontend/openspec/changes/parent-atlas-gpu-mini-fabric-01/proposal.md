## Why

`parent-atlas-ace-radix-residency` proved the CUB-vs-CPU determinism half of `ACE-RADIX-01` in
isolation, but a single radix-sort benchmark says nothing about whether the surrounding retrieval
stack — exact vs approximate ANN, structural graph traversal, ACE/BitFrost hot/warm/cold residency
prediction, LOD promotion — actually holds together end to end. Jumping straight into a custom
cuTile HNSW/graph implementation without first proving each surrounding layer against a CPU/vendor
exact oracle would mean a cuTile bug could corrupt confidence in canonical packet identity, graph
identity, or production evidence with no isolating test to blame. This change builds a small,
synthetic, frozen-fixture GPU proving ground — `GPU-MINI-FABRIC-01` — that exercises every layer
(exact/approximate retrieval, structural graph, ACE-BitFrost residency simulation, radix grouping,
LOD promotion) against a CPU or vendor-exact oracle first, without ever touching canonical
production data.

**Naming warning (recorded, see also root CLAUDE.md)**: NVIDIA's cuVS HNSW build API also uses the
acronym "ACE" (Augmented Core Extraction) — unrelated to this repo's Atlas context/residency
system. All contracts in this change use `AtlasAceResidency*`-style names, never a bare `Ace*`, to
avoid collision with NVIDIA's own use of the term.

## What Changes

- **Phase A — `SEMANTIC-EXACT-PARITY-01` (DONE, this change)**: a frozen synthetic fixture (16,384
  nodes, 64-dim, K=16, 256 queries, fixed seed, zero canonical production data) with three
  deliberately distinct identity-shaped fields per node (`nodeKey`, `projectionOrdinal`,
  `CandidateOrdinal`) so any accidental coordinate conflation fails immediately. PyTorch exact
  GEMM+topk (CUDA) compared against cuVS brute-force exact search (reusing the existing canonical
  `atlas_compute.cuvs_analytics.run_cuvs_exact_knn`, not a new wrapper). **Result: PASS** — recall@16
  = 1.0, rank1 match = 1.0, node-key identity match = 1.0, zero ordinal-conflation hits. Report:
  `docs/reports/gpu-mini-fabric-01-semantic-exact-parity-01.json`.
- **Phase B — `GPU-GRAPH-ANN-01` (staged, not yet built)**: same fixture, cuVS CAGRA graph ANN vs
  the Phase A exact oracle. Recall@{1,8,16}, rank overlap, latency/query, build time, peak VRAM.
  Repeat at 16K → 64K → 256K → 1M, only advancing to the next size after the previous size passes —
  producing an RTX 3060 Ti crossover curve for when graph search actually pays off.
- **Phase C — mini HNSW via CAGRA→HNSW conversion (staged, not yet built)**: cuVS's CAGRA-graph-to-
  HNSW-for-CPU-search conversion path as a GPU-build/CPU-search hybrid challenger, compared against
  the Phase A exact oracle and the Phase B CAGRA result. Not a hand-written HNSW implementation.
- **Phase D — `GPU-GRAPH-STRUCT-01` / `GPU-GRAPH-STRUCT-02` (staged, not yet built)**: a separate
  deterministic structural-graph fixture (`GraphFixtureV1`, 10K nodes, 50K edges, typed
  `IMPORTS`/`CALLS`/`REFERENCES`/`IMPLEMENTS`/`TESTS` edges) — NetworkX BFS/shortest-path/PageRank
  as CPU oracle vs cuGraph BFS/SSSP/PageRank. This is the synthetic precursor to a future
  `GRAPH-06D`-style structural-graph proof. BFS first (bounded-neighborhood expansion maps directly
  to an ACE "evidence around symbol X at depth 2" request); PageRank second.
- **`BITFROST-SIM-01` (staged, not yet built)**: pure-logic simulation (no CUDA required) of
  `AtlasAceResidencyV1` hot/warm/cold prediction — does promoting a candidate's graph-neighborhood
  predict reuse on the *next* query, measured as `hitRate`, `precisionOfPrefetch`, `bytesPromoted`,
  `bytesWasted`, `promotionLatency`, `evictionRate`, `queryLatencyDelta`. Tests whether the utility
  score predicts reuse, not whether it merely looks plausible.
- **`BITFROST-LOD-01` (staged, not yet built)**: identity → glyph → latent64 → latent128 →
  semantic768 → structural → source → prompt-ready promotion/demotion policy test, layered on top
  of `BITFROST-SIM-01`.
- **`SOM-CACHE-01` (staged, not yet built)**: SOM-neighbor-prefetch vs graph-neighbor-prefetch vs
  no-prefetch vs plain-LRU tournament on next-query hit rate. If SOM neighbor prefetch doesn't beat
  the graph-neighbor and LRU baselines, SOM does not earn a place in Parent Atlas beyond
  `STEP-08 experimental`.
- **`CUTILE-ACE-01` (staged, not yet built, LEVEL 3)**: only after `ACE-RADIX-01`'s CUB oracle is
  proven (already `DRY_RUN_PROVEN` from `parent-atlas-ace-radix-residency`) — a single fused
  score→key-pack→partition cuTile kernel as a challenger to the vendor-primitive pipeline. Graph
  traversal is explicitly NOT a cuTile target (irregular, variable-degree, divergent-path workloads
  are the wrong first custom-kernel candidate); the boring, fusable
  glyph-score→residency-key-pack op is.
- **`BITFROST-L2-01` (staged, not yet built)**: CUDA `cudaAccessPropertyPersisting` L2 set-aside
  window experiment for the HOT tier, compared against normal (non-persisting) access — an optional
  physical-executor hint layered *underneath* the already-proven logical `AtlasAceResidencyV1`
  policy, never a redefinition of it. Explicitly last in sequence — L2 tuning without a proven
  logical residency policy underneath it has nothing to optimize.
- **Three-level GPU-primitive discipline recorded** (applies to every phase above): LEVEL 1 vendor
  primitives (cuVS/cuGraph/cuBLASLt/CUB) prove architecture; LEVEL 2 simple custom CUDA/SIMT
  (feature scoring, key packing, gather/scatter, LOD masks) proves a fusion opportunity exists;
  LEVEL 3 cuTile challenger fuses what LEVEL 2 proved worth fusing. No phase skips a level.
- **Model residency stays a separate axis**: QLoRA/base-weights/KV-cache residency
  (`GpuMemoryBudgetV1.MODEL`) is explicitly NOT part of `AtlasAceResidencyV1` (Atlas evidence
  residency: PacketGlyph/latent64/semantic768/graph-neighborhood/source/prompt-material). They may
  share GPU memory telemetry and a future combined scheduler, but an adapter must never become an
  Atlas HOT packet.

## Capabilities

### New Capabilities
- `gpu-mini-fabric-semantic-exact-parity`: Phase A fixture + proof contract (this change lands it
  as PASSED, code-live).
- `gpu-mini-fabric-graph-ann`: Phase B (CAGRA vs exact oracle, crossover-curve methodology) — design
  only in this change, not yet built.
- `gpu-mini-fabric-structural-graph`: Phase D (`GraphFixtureV1`, NetworkX-vs-cuGraph BFS/PageRank
  parity) — design only in this change, not yet built.
- `atlas-ace-residency-simulation`: `BITFROST-SIM-01` + `BITFROST-LOD-01` logical hot/warm/cold and
  LOD-promotion prediction-accuracy contracts — design only in this change, not yet built.
- `parent-atlas-som-cache-tournament`: `SOM-CACHE-01` prefetch-strategy tournament contract —
  design only, not yet built.
- `gpu-primitive-level-discipline`: the LEVEL 1/2/3 (vendor primitive / simple SIMT / cuTile fused)
  ownership discipline that governs every future GPU-accelerated Atlas capability, plus the
  `AtlasAceResidency*` vs NVIDIA-ACE naming-collision rule.

### Modified Capabilities
_(none — extends `ace-bitfrost-residency-glyph` and `ace-radix-01-proof-gate` from
`parent-atlas-ace-radix-residency` conceptually, via composition, but does not change those
capabilities' own requirements.)_

## Impact

- **Code (landed, Phase A)**: `python/atlas_compute/gpu_mini_fabric/` (new package:
  `semantic_exact_parity_fixture.py`, `semantic_exact_parity_01.py`), reusing the existing
  `python/atlas_compute/cuvs_analytics.py::run_cuvs_exact_knn` as canonical cuVS owner — no new
  cuVS wrapper written.
- **Environment (corrected, not new)**: uses the existing, already-proven WSL2 Ubuntu conda
  environment `/home/james/miniforge3/envs/atlas-rapids-cu13` (cuVS 26.06.00, cuGraph 26.06.00,
  cuDF 26.06.01, CuPy 14.1.1, PyTorch 2.13.0+cu130, GPU passthrough confirmed working). No new
  RAPIDS install performed or needed for Phase A.
- **No changes** to canonical production data, Postgres, Qdrant, Redis, or Neo4j — every fixture in
  every phase is synthetic and frozen; `canonical_production_data_touched: false` is asserted in
  every result artifact.
- **Future code (Phases B–D+, staged)**: additional files under `python/atlas_compute/gpu_mini_fabric/`
  per phase, plus a `docs/reports/gpu-mini-fabric-01-*.json` result artifact per phase, following
  the Phase A naming and gate-verdict pattern.
