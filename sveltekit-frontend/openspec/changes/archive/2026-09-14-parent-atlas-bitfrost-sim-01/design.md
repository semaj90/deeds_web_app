## Context

`parent-atlas-gpu-mini-fabric-01` built `GraphFixtureV1` (10K nodes, 50K typed edges —
IMPORTS/CALLS/REFERENCES/IMPLEMENTS/TESTS, `nodeKey` string identity fed directly to both engines)
and proved NetworkX/cuGraph BFS + PageRank parity against it. That same change's design.md Decision
5 requires `BITFROST-SIM-01` (logical hot/warm/cold residency prediction) to be proven correct in
plain logic — no CUDA — before any CUDA/L2/radix implementation (`CUTILE-ACE-01`, `BITFROST-L2-01`)
is attempted, on the grounds that L2/radix work has nothing to optimize if the utility formula
underneath it doesn't actually predict reuse. It left the query-sequence generation methodology as
an explicit Open Question, to be resolved "reusing `GraphFixtureV1` adjacency as the source of
realistic adjacency rather than inventing a third unrelated synthetic graph" — this design resolves
that question and specifies the residency simulation and LOD ladder built on top of it.

This is a pure-Python, no-GPU, no-canonical-data change. It runs in whatever Python environment has
no CUDA dependency at all (does not require `atlas-rapids-cu13` specifically, though running there
is fine too) — a design choice that keeps this phase runnable and reproducible without GPU
contention, matching Decision 5's "front-load the algorithmically risky part before any CUDA work"
rationale.

## Goals / Non-Goals

**Goals:**
- Resolve the query-sequence generation Open Question with a concrete, deterministic, falsifiable
  methodology built on `GraphFixtureV1`'s existing adjacency.
- Implement `AtlasAceResidencyV1`: utility-scored hot/warm/cold tier simulation with promotion,
  eviction, and the full required metric set (`hitRate`, `precisionOfPrefetch`, `bytesPromoted`,
  `bytesWasted`, `promotionLatency`, `evictionRate`, `queryLatencyDelta`).
- Implement the strictly-ordered LOD promotion/demotion ladder
  (identity→glyph→latent64→latent128→semantic768→structural→source→prompt-ready) as a state
  machine layered on top of residency promotion decisions.
- Produce a real, falsifiable PASS/FAIL gate: the utility score must predict next-query reuse
  measurably better than a same-frequency control with no adjacency signal — not just "look
  reasonable."

**Non-Goals:**
- No CUDA, no GPU device access anywhere in this change.
- No production Redis/BitFrost wiring — this is a standalone simulation over the frozen fixture,
  not an integration with the live `bitfrost:*` cache key namespace.
- No canonical Postgres/Qdrant/Neo4j reads or writes.
- No SOM-BMU-neighbor prefetch strategy — that is `SOM-CACHE-01`'s job (parent change section 8),
  which this change unblocks but does not implement. This change's residency baseline (LRU +
  graph-neighbor-utility) is built reusably so `SOM-CACHE-01` can tournament its SOM strategy
  against it without re-deriving a baseline.
- No `cudaAccessPropertyPersisting` L2 benchmarking — that is `BITFROST-L2-01` (parent change
  section 10), explicitly gated on this change's logical policy being proven first.

## Decisions

### 1. Falsifiability substitute for "no CUDA/CPU oracle exists": a same-frequency shuffled control trace
Every phase in the parent change gates on a CPU or vendor-exact oracle (design.md Decision 1
there). This capability has no such oracle — there is no ground-truth "correct" hot/warm/cold
tiering to check against. The substitute: generate **two** query traces from the same underlying
node-visit-frequency distribution —
- **Locality trace**: a biased random walk over `GraphFixtureV1`'s adjacency (see Decision 2) that
  produces realistic session-like structure — consecutive queries are graph-neighbors with
  probability `p_local`.
- **Shuffled control trace**: the exact same multiset of node visits (same node, same visit count),
  with visit *order* randomly permuted — this destroys any neighbor-adjacency correlation between
  consecutive queries while holding node popularity constant.

`AtlasAceResidencyV1` runs against both traces with identical configuration and a fixed seed. The
gate is **`hitRate(locality) - hitRate(control) >= MIN_LOCALITY_LIFT`** (a small positive
threshold, not zero, to guard against a fluke -- e.g. `MIN_LOCALITY_LIFT = 0.03`, tuned during
implementation and recorded in the spec once a fixed run produces a real lift value) — proving the
utility score is actually exploiting graph-neighbor promotion, not merely benefiting from popular
nodes staying warm regardless of order. This is the same "harder, falsifiable bar" principle as the
parent change's Decision 1, adapted to a domain with no exact-computation oracle: the oracle here
is the controlled counterfactual (same population, no adjacency signal), not a second correct
implementation.

**Alternative considered**: gate on absolute `hitRate` alone (e.g. `hitRate >= 0.5`). Rejected —
absolute hit rate on a synthetic fixture is an arbitrary threshold with no way to distinguish "the
residency policy is smart" from "the fixture is dense enough that almost anything gets cache hits."
The lift-over-control comparison is falsifiable in a way an absolute threshold is not.

### 2. Query-sequence generation: seeded biased random walk over `GraphFixtureV1` adjacency
Resolves the parent change's Open Question. Methodology:
- Load `GraphFixtureV1`'s existing node/edge lists directly (no new fixture, no new graph).
- Fix `TRACE_LENGTH` (e.g. 4,000 queries) and `LOCALITY_PROBABILITY` (`p_local`, e.g. 0.6) as named
  constants, with a fixed RNG seed for full reproducibility (`numpy.random.default_rng(seed)`,
  matching the parent change's determinism convention).
- At each step, with probability `p_local`: pick the next queried node uniformly at random from
  the current node's outgoing-edge neighbors (falling back to a uniform-random node if the current
  node has zero out-edges — `GraphFixtureV1`'s dangling-node variant guarantees this is rare but
  not impossible). Otherwise (probability `1 - p_local`): jump to a uniform-random node from the
  full 10K-node set (models an unrelated new query / topic switch).
- Record the resulting `nodeKey` sequence as `QuerySequenceV1` — a flat list, no additional
  metadata needed since `GraphFixtureV1` already carries typed-edge structure the residency
  simulation reads directly.
- Derive the shuffled control trace (Decision 1) by `rng.permutation()` of the same sequence —
  same multiset, guaranteed-different adjacency correlation, same RNG seed lineage for
  reproducibility.

**Alternative considered**: a Markov-chain model fit to real production query logs. Rejected for
this change — no real query-log corpus is in scope here (would pull in production data, violating
the Non-Goals), and a synthetic biased-walk trace is sufficient to test whether the *utility
formula* correctly exploits graph locality, which is the actual thing under test. A real-log-based
trace is a reasonable future upgrade once this synthetic gate passes, not a blocker for it.

### 3. `AtlasAceResidencyV1` tiers, promotion, and eviction
Three tiers — `HOT`, `WARM`, `COLD` (implicit: everything not in HOT/WARM) — with bounded capacity
(`HOT_CAPACITY`, `WARM_CAPACITY`, both named constants). On each query:
1. Check current tier of the queried node → record hit/miss, contributing to `hitRate` and
   `queryLatencyDelta` (a nominal per-tier latency cost model: `HOT < WARM < COLD`, documented as
   fixed constants, not benchmarked wall-clock numbers, since this is pure logic with no I/O).
2. Promote the queried node itself toward HOT (utility score = recency-weighted frequency).
3. Promote the queried node's direct outgoing-edge neighbors to WARM, weighted by edge type (e.g.
   `CALLS`/`IMPORTS` edges weighted higher than `TESTS` — a fixed, documented weighting, not
   learned) — this is the "prefetch" the `precisionOfPrefetch` metric evaluates.
4. If a tier is over capacity after promotion, evict the lowest-utility-score member — utility-score
   eviction is the primary policy under test, but the same simulation harness must also support a
   plain LRU eviction mode (a config flag, not a separate implementation) so `SOM-CACHE-01`'s later
   4-way tournament (no-prefetch / LRU / graph-neighbor / SOM-BMU-neighbor) can reuse this harness
   directly rather than rebuilding it.

`bytesPromoted`/`bytesWasted` use a nominal per-LOD-rung byte-size table (Decision 4) rather than
measuring real packet sizes — this is a synthetic-fixture proving ground, not a production
byte-accounting system.

**Alternative considered**: score purely on frequency (no recency decay). Rejected — a pure-frequency
score can never demote a node once popular even if query patterns shift mid-trace, which would make
the eviction/wasted-bytes metrics meaningless (nothing would ever get evicted in a stationary-ish
fixture). A recency-weighted score is a one-line addition and materially improves the test's ability
to falsify a bad formula.

### 4. Nominal per-LOD-rung byte-size table, documented not benchmarked
The 8-rung ladder (identity → glyph → latent64 → latent128 → semantic768 → structural → source →
prompt-ready) needs *some* byte-size figure per rung to compute `bytesPromoted`/`bytesWasted`
meaningfully. Use a documented, clearly-labeled nominal table (e.g. identity ~32B, glyph ~16B per
root CLAUDE.md's `PacketGlyphV1` ~16-byte-packed design, latent64 = 64×4B=256B, latent128=512B,
semantic768=768×4B=3072B, structural/source/prompt-ready as larger fixed placeholders) rather than
pulling real production packet sizes — this keeps the simulation fully self-contained and avoids a
false sense of precision from numbers that were never measured against real packets. The table is
recorded as a named constant map so anyone reviewing the result JSON can see exactly what was
assumed.

**Alternative considered**: skip byte-accounting metrics entirely since no real sizes exist yet.
Rejected — the parent capability's own spec (`atlas-ace-residency-simulation/spec.md`) requires
`bytesPromoted`/`bytesWasted` in the reported metric set; a nominal-but-documented table satisfies
that requirement honestly, whereas omitting the metric would silently narrow the parent spec's
already-agreed scope.

### 5. LOD ladder is a strict adjacent-only state machine, independent of but layered on residency tiers
The LOD ladder (identity/glyph/latent64/.../prompt-ready) and the residency tiers (HOT/WARM/COLD)
are two independent axes — a candidate's LOD rung is "how much detail is materialized" and its
residency tier is "how likely it is to survive to the next query." `AtlasLodLadderV1` enforces: a
promotion request must move exactly one rung (never skip), and any attempted skip either raises
(rejected) or is logged with an explicit `overrideReason` string (allowed, but recorded) — matching
the parent spec's own requirement verbatim. Promotion through the LOD ladder is triggered by the
same graph-neighbor-promotion event as WARM residency promotion (Decision 3 step 3), but the two
state machines are validated independently so a bug in one is never masked by the other.

### 6. Naming: `AtlasAceResidencyV1` and `AtlasLodLadderV1`, never bare `Ace*`
Per root CLAUDE.md's NVIDIA-ACE naming-collision rule and the parent change's Decision 6, every
contract here uses an `Atlas`-prefixed name. No exported type or module in this change uses a bare
`Ace*` identifier.

## Risks / Trade-offs

- **[Risk]** The `MIN_LOCALITY_LIFT` threshold (Decision 1) is somewhat arbitrary until a real run
  produces actual lift numbers. → **Mitigation**: implementation task records the real observed
  lift from the first run in this change's tasks.md and the result JSON, and the spec's numeric
  gate is finalized against that real number rather than guessed in advance — consistent with how
  the parent change recalibrated its own `topKOverlap` gate (0.95, not 1.0) after seeing a real
  result.
- **[Risk]** A purely synthetic random-walk trace may not represent real Parent Atlas retrieval
  session locality patterns (e.g. real sessions might have much higher or lower `p_local` than the
  chosen constant). → **Mitigation**: `p_local` is a named, documented constant, not hardcoded
  inline — a future change can re-run this exact harness with a different `p_local` or a real
  query-log-derived trace without redesigning the residency/ladder logic.
- **[Trade-off]** Building the LRU-eviction-mode flag into this change's harness (Decision 3) adds
  scope beyond the minimum needed to prove `AtlasAceResidencyV1` alone, but avoids `SOM-CACHE-01`
  reimplementing the same query-trace/promotion/eviction harness from scratch — judged worth the
  small added scope given the parent change's own session-handoff explicitly sequences
  `SOM-CACHE-01` right after this capability.

## Migration Plan

No production migration — pure-Python simulation code under a new package, zero existing consumers,
zero canonical-data impact.

## Open Questions

- ~~Whether `TRACE_LENGTH=4000` and `p_local=0.6` are the right defaults~~ — **RESOLVED (real run,
  2026-09-14)**: yes, no retuning needed. The live run (after fixing the two real bugs recorded in
  tasks.md 2.6 — an eviction-counting bug, and a `PYTHONHASHSEED`-driven non-determinism bug in
  eviction tie-breaking) produced `hitRate(locality)=0.6145` vs `hitRate(control)=0.08025` — an
  observed lift of `0.53425`, ~17.8× the `MIN_LOCALITY_LIFT=0.03` gate, verified stable across three
  different `PYTHONHASHSEED` values. `MIN_LOCALITY_LIFT` was deliberately kept at `0.03` rather than
  raised toward the observed value (see tasks.md 4.3) — it was already a principled "guard against a
  fluke" floor, and raising it to match one run's exact result would overfit the gate rather than
  keep it meaningful for future parameter sweeps.
- Whether a future revision should replace the synthetic random-walk trace with one derived from
  real Parent Atlas retrieval logs — explicitly deferred, not required for this change's gate to be
  meaningful (see Decision 2's alternative-considered note).
- **New finding from the real run, not anticipated at design time**: LRU eviction and the
  `utility-score` eviction mode produced nearly identical `hitRate` (0.61475 vs 0.6145) on this
  fixture/trace, because the trace's high node-diversity (8,284 unique nodes touched against a
  600-slot combined HOT+WARM capacity) means most nodes are visited only once or twice, where
  recency-weighted-frequency and pure-recency converge. This is a real constraint the future
  `SOM-CACHE-01` tournament design must account for: its SOM-BMU-neighbor and graph-neighbor
  strategies will need to demonstrate separation from LRU specifically, not just from a
  no-prefetch baseline, since a naive utility formula does not reliably beat LRU on this kind of
  high-diversity trace.
