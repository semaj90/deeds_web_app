## Context

`parent-atlas-ace-radix-residency` proved radix-sort determinism in isolation but left every
surrounding layer (exact-vs-approximate retrieval, structural graph traversal, ACE/BitFrost
residency prediction, LOD promotion) unproven relative to each other. Jumping directly to a custom
cuTile HNSW/graph implementation risks corrupting confidence in canonical identity with no isolating
oracle to blame a failure on. This design lays out a phased proving ground where every custom or
approximate layer sits directly next to a CPU or vendor-exact oracle, on synthetic data only.

The environment for this work already exists and is proven: WSL2 Ubuntu,
`/home/james/miniforge3/envs/atlas-rapids-cu13` (cuVS 26.06.00, cuGraph 26.06.00, cuDF 26.06.01,
CuPy 14.1.1, PyTorch 2.13.0+cu130, RTX 3060 Ti GPU passthrough confirmed). Do not create a second
environment or upgrade this one (26.06 → 26.08) without first demonstrating the existing environment
is unusable for a specific reason — an upgrade mid-series would muddy `GpuExecutionIdentityV1`-style
reproducibility evidence across phases.

## Goals / Non-Goals

**Goals:**
- Prove Phase A (`SEMANTIC-EXACT-PARITY-01`) — done in this change, PASS.
- Fully specify Phases B–D and the four residency/SOM/cuTile/L2 tests as design contracts precise
  enough to implement without further design decisions, using this change's Phase A patterns
  (frozen synthetic fixture, deliberately-distinct identity fields, CPU/vendor-exact oracle first,
  `docs/reports/gpu-mini-fabric-01-*.json` result artifacts, PASS/FAIL gates).
- Record the LEVEL 1/2/3 GPU-primitive discipline and the `AtlasAceResidency*` vs NVIDIA-ACE naming
  rule as durable governance, referenced by every future phase.

**Non-Goals:**
- Do not implement Phases B–D, `BITFROST-SIM-01`, `BITFROST-LOD-01`, `SOM-CACHE-01`, `CUTILE-ACE-01`,
  or `BITFROST-L2-01` in this change — each is staged as its own follow-up implementation pass,
  gated on the phase before it passing.
- Do not touch canonical production Postgres/Qdrant/Redis/Neo4j data at any phase, ever.
- Do not attempt a hand-written HNSW or graph-traversal cuTile kernel — Phase C uses cuVS's own
  CAGRA→HNSW conversion path, and `CUTILE-ACE-01`'s only sanctioned cuTile target is the boring,
  fusable glyph-score→residency-key-pack operation, never graph traversal.
- Do not install or upgrade RAPIDS in this change — the existing `atlas-rapids-cu13` environment is
  sufficient and already proven for every phase through at least Phase D.

## Decisions

### 1. Every phase gates on a CPU or vendor-exact oracle, never on "looks plausible"
Phase A's PyTorch exact GEMM+topk is the oracle for Phase B's CAGRA and Phase C's HNSW conversion.
Phase D's NetworkX BFS/PageRank is the oracle for cuGraph's BFS/PageRank. `BITFROST-SIM-01`'s test
is explicitly "does the utility score predict next-query reuse", not "does the score look
reasonable" — a deliberately harder, falsifiable bar. **Rationale**: this is the single design
principle threading through the entire proposal — a cuTile bug (or any approximate-algorithm bug)
can only fail its own challenger test, never silently corrupt confidence in something claimed
correct elsewhere.

### 2. Fixture identity fields are deliberately three distinct values per node
Every phase's fixture carries `nodeKey` (string), `projectionOrdinal` (a permutation, not row
index), and `CandidateOrdinal` (a second, independent permutation) — see Phase A's
`semantic_exact_parity_fixture.py` for the pattern. Phase A's own proof script asserts, at every
query, that neither ordinal accidentally aliases to the row index's own `nodeKey` — a nonzero count
here would mean a real conflation bug in that specific fixture instance, distinct from the recall/
rank-agreement gates. **Alternative considered**: use two of the three fields (e.g. only `nodeKey`
and `projectionOrdinal`). Rejected — this repo already has real production incidents from exactly
this class of conflation (root CLAUDE.md's PageRank/`gpuNodeId` caution, and the
`ResidencySortKeyV1` design's explicit exclusion of `packetKey`), so the fixture should actively
try to catch it, not just avoid it by construction.

### 3. Reuse `atlas_compute.cuvs_analytics.run_cuvs_exact_knn`, never write a second cuVS wrapper
Phase A imports the existing canonical cuVS brute-force wrapper rather than re-implementing
`cuvs.neighbors.brute_force` calls inline. Future phases must do the same for any cuVS/cuGraph
capability that already has a wrapper in `python/atlas_compute/` — check there first, per this
repo's Duplication Prevention rule, before writing new vendor-API glue code.

### 4. Crossover-curve methodology for Phase B is sequential, not parallel
16K → 64K → 256K → 1M, advancing only after the prior size passes. **Rationale**: a failure at a
larger N with a passing smaller N is itself useful data (tells you where GPU graph ANN stops paying
off on an 8GB card), but attempting all sizes in parallel before any pass would waste GPU time on
sizes whose prerequisite hasn't been validated, and would make a failure harder to isolate to a
specific N.

### 4a. CORRECTED (2026-09-01, controlled test run): the N=65536 recall drop is a `build_algo` quality issue, NOT VRAM/workspace pressure
An earlier pass of this document hypothesized, from the build log alone, that workspace-constrained
memory during CAGRA's default `build_algo="ivf_pq"` graph build was the likely cause of the N=65536
recall drop (`GPU-GRAPH-ANN-01`'s `recall@16=0.8289`), and recommended retrying under more free VRAM
and with `build_algo="nn_descent"` before concluding anything. **That retry has now been run — see
`GPU-GRAPH-ANN-02A/02B` in tasks.md — and it falsifies the VRAM-pressure hypothesis**:

- **02A** (`build_algo="ivf_pq"`, `itopk_size=64`, same fixture/oracle/seed as the original run) was
  executed with **1539MB free VRAM** (vs. ~200–900MB during the original run — a ~2–7x improvement
  in headroom) and still produced `recall@16=0.8391`, nearly identical to the original `0.8289`. The
  `"reducing IVF-PQ search max_internal_batch_size..."` log line still fired even with this much more
  headroom — it is evidently a fixed internal heuristic at this N, not purely a function of available
  VRAM at the time.
- **02B** (`build_algo="nn_descent"`, `itopk_size=64` — itopk_size deliberately left untouched from
  CAGRA's default, isolating build_algo as the only changed variable) produced `recall@16=0.9980` —
  a dramatic improvement over 02A at the *same* search budget.

**Conclusion**: the recall gap is a real `build_algo="ivf_pq"` graph-quality limitation at this
N=65536/dim=64 combination on this fixture, not a VRAM/workspace artifact of this host's shared-GPU
contention. `nn_descent` (an alternate CAGRA initial-graph builder) and `itopk_size` tuning (see
decision 4a-itopk below) are two *independent* levers that each separately resolve it — this was
worth verifying by controlled isolation rather than assumed from the earlier itopk-only sweep, which
held `build_algo="ivf_pq"` fixed throughout and could not have distinguished between these two causes.
A `CagraBuildReceiptV1` (`freeVramBeforeMib`, `peakVramDuringBuildUsedMib`,
`internalBatchReductionObserved`, `buildAlgo`, `graphDegree`, `intermediateGraphDegree`,
`buildTimeMs`, `graphChecksum`) is now captured on every CAGRA build so any future recall regression
is attributable to a concrete, reproducible execution/build condition rather than argued from
inference.

### 4a-itopk. `itopk_size` sweep, run AFTER build-algorithm isolation (not before, as originally sequenced)
The itopk_size sweep (`GPU-GRAPH-ANN-02`, tasks.md section 4a) was actually run before the build-algo
isolation above — out of the correct methodological order. Per NVIDIA's own CAGRA tuning guidance
(tune `itopk_size` first, then `graph_degree`, then `intermediate_graph_degree` — a search-side vs.
build-side distinction), the correct sequence is: isolate build quality first (02A/02B, above), THEN
sweep the search-side knob on top of the better-understood build. The itopk sweep's own result
(0.835→0.998 raising itopk_size 64→512, entirely on `build_algo="ivf_pq"`) remains valid data, but it
does not by itself distinguish "itopk_size fixed it" from "a different build would have fixed it
regardless of itopk_size" — both are now independently confirmed true, but that wasn't established
until the 02A/02B isolation ran.

### 4b. GPU-native fixture generation (cuRAND/cupy.random) for larger tiers (found via web research, 2026-09-01)
Phase A and B's fixtures are generated on CPU via `numpy.random.default_rng` then transferred to GPU.
This is not the cause of the Phase B recall issue (256K/64-dim = tens of MB, generation and H2D
transfer are both sub-second), but `cupy.random.Generator` with the `Philox4_32_10` counter-based bit
generator is the correct GPU-native, deterministically-reproducible alternative for the 256K/1M tiers
if CPU-side generation or transfer ever becomes a bottleneck — Philox is specifically designed for
reproducible parallel-stream generation (unlike some GPU RNGs), matching this proving ground's
determinism requirement. Not adopted yet — CPU generation remains simpler and was not the bottleneck
in the runs so far; noted as the correct escalation path if it becomes one.

### 4c. CORRECTED (2026-09-01, verified against primary source after an over-strong initial claim): the real PageRank-parity lesson from `rapidsai/cugraph#482` is graph-construction semantics, not dangling nodes
An earlier pass of this document cited `rapidsai/cugraph#482` as evidence that cuGraph's `dangling`
parameter being a no-op would cause a PageRank divergence, and required `GraphFixtureV1` to have zero
dangling nodes specifically because of that issue. **That attribution was wrong** — verified by
pulling the issue's full comment thread directly (GitHub API, not a search summary). The actual root
cause, in the reporter's own closing words: *"NetworkX, when loaded from edge list, creates
undirected graph by default. Cugraph creates directed one. After loading edgelist as digraph, it all
fits."* An intermediate comment from a cuGraph maintainer also flagged a vertex-count mismatch caused
by NetworkX silently dropping/renumbering vertices differently than cuGraph. **Dangling-node handling
is never mentioned anywhere in that thread.**

The real, more general lesson #482 supports: **PageRank parity requires identical graph semantics**
— directedness, vertex set, edge set, weighting, and renumbering must all match exactly between the
two engines, or results diverge for reasons that have nothing to do with either implementation's
correctness. This is now captured as its own contract, `GraphExecutionSemanticsV1` (`directed`,
`vertexCount`, `edgeCount`, `weighted`, `symmetrized`, `renumbered`, `ordinalMapChecksum`,
`danglingNodeCount`), computed and compared for both engines' constructed graphs BEFORE any PageRank
comparison runs — this would have caught the #482 class of bug immediately, before results were even
computed, rather than after.

**Separately** (and still true, verified directly against cuGraph's own API docs, independent of
#482): cuGraph's `pagerank()` docstring for the `dangling` parameter literally states *"This
parameter is here for NetworkX compatibility and ignored."* This is a real, documented behavior
difference from NetworkX (which does use its `dangling` parameter to redistribute rank). But no
issue or test in this repo has yet demonstrated this behavior difference actually changing a
PageRank result on a concrete graph — it is a documented API-semantics fact, not (yet) an empirically
measured effect.

**Design consequence — do not forbid dangling nodes from the production graph contract.** Real code
graphs will naturally have dangling nodes (leaf files with no outgoing imports, terminal symbols,
etc.) — designing `GraphFixtureV1` to always exclude them would test something unrepresentative of
production. Instead, split into two fixtures with different, explicit purposes:
- **`GRAPH-PAGERANK-01`** (what this change originally built as `GraphFixtureV1`): directed,
  identical vertex set, identical edge set, **zero dangling nodes** — an explicit **experimental
  isolation** fixture whose purpose is establishing basic CPU/GPU numerical parity with one semantic
  variable (dangling-node handling) removed, not a claim about what production graphs look like.
- **`GRAPH-PAGERANK-02`** (not yet built): the same fixture generation approach but *with* dangling
  nodes present, purpose-built to characterize whether/how the documented `dangling`-parameter no-op
  actually changes results in practice — an explicit backend-semantics characterization test, run
  and interpreted as its own thing, not folded into 01's pass/fail gate.

Damping factor (alpha=0.85) and tolerance defaults are aligned between the two libraries and remain
not a concern.

### 5. `BITFROST-SIM-01` runs before any CUDA residency code, in plain logic
Hot/warm/cold prediction accuracy is testable as pure query-sequence simulation — no GPU required.
This deliberately front-loads the algorithmically risky part (does the utility formula predict
reuse) before any CUDA/L2/radix implementation work, so a bad utility formula is caught cheaply.
**Alternative considered**: build `BITFROST-L2-01`'s CUDA L2 experiment first, since it's the most
novel/interesting mechanism. Rejected — L2 persistence tuning has nothing to optimize if the
logical residency policy underneath it is unproven; per the roadmap's own "L2 comes after logical
BitFrost" framing.

### 6. `AtlasAceResidency*` naming, never bare `Ace*`
Every contract introduced by this change or a follow-up phase uses `AtlasAceResidency*` (or a
similarly Atlas-prefixed name), never a bare `Ace*` name that could collide with NVIDIA's own
"ACE" (Augmented Core Extraction) HNSW-build-API terminology. Recorded in root CLAUDE.md as a
standing rule, not just this change's local convention.

## Risks / Trade-offs

- **[Risk]** Phase A's fixture uses 64 dimensions and 16,384 nodes specifically because cuVS
  recommends brute-force/exact search (not CAGRA) below ~100K vectors — meaning Phase A's PASS says
  nothing about CAGRA's own correctness at any scale. → **Mitigation**: Phase B is a separate,
  explicit phase with its own oracle comparison; Phase A's PASS only unblocks starting Phase B, it
  is not evidence for Phase B's own claims.
- **[Risk]** `atlas-rapids-cu13` is a single shared environment; a future phase's dependency change
  (e.g. installing a package needed only for `SOM-CACHE-01`) could destabilize an earlier phase's
  reproducibility. → **Mitigation**: any new dependency install into this environment must be
  recorded in this change's tasks.md (or a follow-up change) with a rationale, and existing phases
  should be re-run after any environment change to confirm they still pass.
- **[Risk]** `BITFROST-SIM-01`'s "does it predict reuse" test requires a query-sequence generator
  with realistic-enough graph-neighborhood structure to be a meaningful test — a trivially-easy or
  trivially-hard synthetic sequence would produce a misleadingly high or low hit-rate signal.
  → **Mitigation**: `BITFROST-SIM-01`'s own future design pass must specify the query-sequence
  generation methodology explicitly (not left as an implementation detail), reusing the
  `GraphFixtureV1` structural fixture from Phase D as the source of realistic adjacency rather than
  inventing a third unrelated synthetic graph.
- **[Trade-off]** Reusing `atlas_compute.cuvs_analytics.run_cuvs_exact_knn` means Phase A's result is
  coupled to that module's `canonical_authority: false` framing (it explicitly does not claim to be
  a canonical relationship producer) — this is intentional and consistent with Phase A being a
  synthetic-fixture correctness test, not a canonical-data operation, but means the receipt shape
  in Phase A's result JSON is inherited from that module rather than independently designed.

## Migration Plan

No production migration — this is a design-and-proving-ground change with zero canonical-data or
production-code-path impact. Phase A's code lives entirely under
`python/atlas_compute/gpu_mini_fabric/`, a new package with no existing consumers to migrate.

## Open Questions

- Exact query-sequence generation methodology for `BITFROST-SIM-01` (see Risk above) — deferred to
  that phase's own implementation pass.
- Whether `SOM-CACHE-01`'s SOM training happens via a GPU pipeline or a CPU-only clustering
  approximation for the test fixture — deferred; either is acceptable for a correctness/tournament
  test as long as it's clearly labeled which was used.
- Whether Phase B's crossover curve should also record VRAM headroom against *other* concurrently
  running GPU workloads on this shared 8GB card (llama-server, etc. — confirmed only ~284MB free at
  time of writing) — likely yes, but the exact telemetry mechanism is deferred to Phase B's own
  implementation pass.
