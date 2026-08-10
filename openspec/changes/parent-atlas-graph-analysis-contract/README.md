# Parent Atlas — Graph Analysis Run/Promotion Contract

**See root `CLAUDE.md`'s "Duplication Prevention — Audit Before You Build"
section** — this change's Patch C/D findings (5 competing PageRank
implementations, 4 nonexistent relationship types silently accepted) are
recorded there as durable evidence for a repo-wide audit-first checklist.

**Status**: PATCH A + PATCH B + PATCH C + PATCH D + PATCH E (2026-08-09) —
contracts, persistence, PageRank, Louvain, Leiden, and the
community-taxonomy evaluator are all implemented and live-verified. GA1
(PageRank) and GA3 (both Louvain and Leiden) are **RUNTIME_SMOKE_PROVEN**.
Patch E answered README point 10 with real data instead of resolution-
parameter tuning — see tasks.md's "Patch E" section for the full 5-row
comparison table and findings, headline results:
- **`atlas_execution_v1` (CALLS-only) has negative modularity and 100%
  singleton communities** — no real community structure exists on the call
  graph in isolation.
- **`atlas_dependency_v1` (IMPORTS-only) is the cleanest result**: 0.8486
  modularity, moderate max community size (390).
- **Leiden vs. Louvain barely differ** on the one projection both can run on
  (`atlas_feature_v1`: 0.9735 vs 0.9736 modularity) — projection choice
  dominates, not algorithm choice.
- Patch D's original "88.6% singletons = degenerate combined projection"
  hypothesis is **not confirmed** — `atlas_feature_v1` alone produces the
  same singleton-heavy shape (0.888), so that wasn't a projection-mixing
  artifact.
- **Neo4j GDS Leiden requires undirected graphs** (confirmed live via a
  thrown `IllegalArgumentException`) — Leiden cannot run on the directed
  `atlas_dependency_v1`/`atlas_execution_v1` projections, a real algorithmic
  constraint, not a bug to route around.

Patches C–E all turned up real, fixed bugs along the way — see tasks.md's
"Patch C pre-flight audit", "Patch C", "Patch D", and "Patch E" sections for
full details, including: Patch C's corrected target
(`neo4j-gds-client.ts::runPageRankClient`, the only one of 5 PageRank code
paths in this repo with a runtime proof, after the README-assumed live
promotion path turned out not to exist); a concurrent
`AnalysisRunEnvelopeSchema` design change (shared lineage envelope across
graph/model/experiment analysis runs) reconciled across all three patches; a
shared `graph-packet-key-resolver.ts` so PageRank/Louvain/Leiden join Neo4j
identity to `atlas_packets.packet_key` the same way instead of reinventing
(and getting wrong) a `stable_key`-based join root `CLAUDE.md` explicitly
forbids; a real idempotency bug (`gds.<algo>.mutate` failing on a second run
against a long-lived projection) fixed once, shared by both community
algorithms; a real projection-filtering gap (`ensureProjectionClient` ignored
its own `projectionName` for relationship-type selection — every "named
projection" was secretly a full duplicate of `codeTopology`) found and fixed
via a `relationshipTypeOverride` parameter, verified live by an exact edge-
count match; and `NAMED_PROJECTION_CANDIDATES`' original relationship types
(`REQUIRES`/`RETURNS`/`PARAMETER_OF`/`IMPLEMENTS_REQUIREMENT`/`EXTENDS`)
turning out not to exist anywhere in the live graph, replaced with real live
types. GA5–GA9 (Patch F+) are deliberately not started, gate-by-gate, per
this repo's established discipline for large external plans (see
`parent-atlas-agentic-repair-bundle-integration` and
`parent-atlas-graph-runtime-enhancement`'s own T0 precedent).

## Why this change exists

`parent-atlas-graph-runtime-enhancement` proved GR2/GR3 (APOC bounded
traversal, GDS BFS/Dijkstra/PageRank) and started a GR5 Leiden lane
(`compute-leiden-neo4j.mjs`, `leiden_community_id` node property + Postgres
table). The next planned additions — CheiRank, k-core, betweenness — would
each have invented their own persistence shape if implemented directly on top
of the existing ad hoc PageRank/Louvain/Leiden code paths. Before adding more
algorithms, this change establishes **one versioned graph-analysis run
envelope** that every algorithm's results reference, so lineage, evaluation,
and retrieval-promotion are uniform instead of accumulating one bespoke column
per algorithm on `atlas_packets`.

## The core invariant

```
GRAPHIFY   → construct topology
ANALYZE    → PageRank, CheiRank, communities, k-core, betweenness
EVALUATE   → prove usefulness and stability
PROMOTE    → select analytical outputs as retrieval features
RETRIEVE   → FeatureRow → RRF/reranker
LEARN      → (later) XGBoost / policy replay
```

**Analysis results are not retrieval features merely because they exist.**
Running an algorithm successfully (`RUNTIME_SMOKE_PROVEN`) and that algorithm's
output improving retrieval (`RETRIEVAL_PROMOTION`) are two separate, sequential
proofs — never conflate them. This is the same discipline as this repo's
existing PageRank promotion gate (`pagerank-promotion-gate.ts`,
`pagerank_raw` vs. `pagerankAuthority`), generalized to every future graph
algorithm.

## Pre-existing infrastructure this change builds on (audited, not duplicated)

Before writing new contracts, audited what already exists in
`sveltekit-frontend/src/lib/server/graph/`:

- **`graph-contract.ts`** — `GraphSnapshotSchema`, `PageRankRunSchema`,
  `PageRankScoreSchema`, `normalizePageRankL1()`. PageRank-specific; the
  `GraphSnapshot` concept is adjacent to but not the same as the new
  `GraphProjectionManifest` below (a snapshot is an extracted node/edge set
  with a content hash; a projection manifest describes a live in-memory GDS
  projection with labels/rel-types/orientation).
- **`pagerank-authority-contract.ts`** — `PageRankAuthorityRecordSchema`,
  `PageRankAuthorityBatchSchema`, `PageRankValidationReportSchema`. This is
  the mature "raw analytical result → validated → promoted authority" pattern
  already built for PageRank specifically — exactly the shape point 5 below
  generalizes to CheiRank/k-core/betweenness/communities.
- **`pagerank-promotion-gate.ts`** — the actual promotion gate implementation.
- **Found and flagged, not fixed**: `PageRankRunSchema` is defined **twice**,
  differently, in `graph-contract.ts` and `pagerank-authority-contract.ts`.
  Pre-existing duplication, out of scope for this change's Patch A
  (contracts-only, no behavior change) — noted for a future consolidation
  pass, not touched here.
- **`neo4j-gds-client.ts`** / **`neo4j-gds.ts`** / **`graph-analytics-service.ts`**
  — canonical low-level GDS/APOC call layer (PageRank, BFS, Dijkstra), proven
  in the sibling `parent-atlas-graph-runtime-enhancement` change.
- **`scripts/atlas/compute-leiden-neo4j.mjs`** — the new Leiden lane (writes
  `leiden_community_id` + a separate Postgres table, does not touch Louvain's
  `communityId`).

## The generalized contract (this change's contribution)

### 1. `GraphAnalysisRun` — the lineage backbone

Every algorithm run (PageRank, CheiRank, Louvain, Leiden, k-core, betweenness,
personalized PageRank) produces exactly one `GraphAnalysisRun` row. Individual
metric/community results reference `runId`. This replaces "one more column on
`atlas_packets` per algorithm" with:

```
canonical source graph → GraphAnalysisRun → algorithm-specific results
  → evaluation → promotion → FeatureRow
```

### 2. Three-layer persistence ownership

| Layer | Owner | Contents |
|---|---|---|
| **IDENTITY** | `atlas_packets` | `packet_key`, `symbol_version_id`, `source_ref`, `workspace_revision`, `source_revision`, `representation_id`, `representation_revision` — never gains new algorithm-specific columns |
| **ANALYSIS** | `graph_analysis_runs`, `graph_node_metrics`, `graph_community_assignments`, `graph_communities` | Offline analytical results, one row per run/metric/assignment |
| **PROMOTED RETRIEVAL FEATURES** | `atlas_packet_features` (`FeatureRowV1`) | Only features that passed evaluation — `pagerankAuthority`, not `pagerank` |

### 3. `graph_node_metrics` — versioned, not EAV-everywhere

```
run_id | packet_key | symbol_version_id | metric_name | metric_value | graph_revision | algorithm_revision | created_at
```

Bounded to offline graph-analysis results whose dimensionality varies by
algorithm (pagerank, cheirank, kcore, betweenness as rows, not columns). This
is **not** a general EAV table for every Parent Atlas feature — `FeatureRowV1`
stays typed and small.

### 4. Communities get two tables, not one scalar property

- `graph_community_assignments`: `run_id | packet_key | algorithm | community_id | level | graph_revision | created_at`
- `graph_communities` (the taxonomy): `run_id | algorithm | community_id | parent_community_id | member_count | representative_packet_keys | representative_symbols | label | purity | modularity_contribution | metadata`

`leiden_community_id: 46271` on its own is an algorithm assignment, not a
taxonomy. The taxonomy lives in `graph_communities`.

### 5. PageRank convergence target

```
runPageRank → GraphAnalysisRun + graph_node_metrics(pagerank)
            → PageRank evaluation gate
            → promotion → FeatureRow.pagerankAuthority
```

`pagerank_raw` (analytical) vs. `pagerankAuthority` (promoted — passed
lineage/coverage/evaluation gates, approved for retrieval) stays a hard
distinction, matching the existing `pagerank-authority-contract.ts` pattern.

### 6. CheiRank reuses PageRank infrastructure

CheiRank(A, B) = PageRank(B, A) — i.e. PageRank on the reversed graph. Add an
`orientation: 'natural' | 'reverse'` parameter (or a separately materialized
reversed projection) to the PageRank run config rather than building a
parallel CheiRank engine. Persist as a different `metric_name` +
`algorithm_revision`. Enables later joint signals: high PageRank + high
CheiRank (structurally central, bidirectional), high PageRank + low CheiRank
(authority/sink), low PageRank + high CheiRank (hub/source) — useful
structural classes for a code graph.

### 7. k-core is topology, not authority

Keep separate. Promotion question is "does k-core improve Domain 10 retrieval
ranking?", not "did GDS compute k-core successfully?" — two different gates
(GA6 vs. GA8/GA9 below).

### 8. Betweenness stays cold longer

Expensive, potentially noisy on a large heterogeneous code graph. High
betweenness = bridge between subsystems (API boundaries, adapters,
orchestrators, shared interfaces, DB gateways, retrieval-fusion owners). Use
first for architecture analysis / bridge detection / repair-context
expansion — not immediately for ranking. Promote to retrieval only after a
separate ablation.

### 9. Louvain/Leiden need an evaluation owner, not an env var

`ATLAS_COMMUNITY_ALGORITHM=louvain|leiden` (the current operational selector)
must never decide promotion. Add `community-taxonomy-policy.ts`: computes
`CommunityEvaluation` (coverage, modularity, communityCount, singletonRatio,
p50/p95/max community size, subsystem purity, stability) for Louvain and
Leiden on the **identical frozen projection**, before either is promoted.

### 10. The 57,638-community Leiden result is a projection-design problem, not a tuning problem

GR5.2's dry run (59,692 nodes / 102,666 relationships → 57,638 communities,
near one-community-per-node) should **not** be chased by tuning Leiden's
resolution parameter blindly. Before any tuning: partition the projection by
relationship semantics and compare community quality per projection, e.g.:

- `atlas_dependency_v1` — `IMPORTS`, `REQUIRES`, `IMPLEMENTS`, `EXTENDS`
- `atlas_execution_v1` — `CALLS`, `RETURNS`, `PARAMETER_OF`
- `atlas_feature_v1` — `IMPLEMENTS_REQUIREMENT`, `BELONGS_TO_FEATURE`, `SIMILAR_TOPOLOGY`
- `atlas_combined_v1` — everything (the current `EVERY_RELATIONSHIP` approach)

This may produce a dramatically better taxonomy than resolution-parameter
tuning on the undifferentiated combined graph.

### 11. `GraphProjectionManifest` — reproducibility contract

Every analytical run must record exactly which projection it ran against:
`projectionRevision`, `graphRevision`, `nodeLabels`, `relationshipTypes`,
`orientation`, `relationshipWeights`, `nodeCount`, `relationshipCount`,
`createdAt`. Solves "which graph did this PageRank run actually see?" —
otherwise unanswerable after the fact.

### 12. `FeatureRowV1` stays small

Baseline: `packetKey, dense, sparse, rrf, ast, pagerankAuthority, freshness,
crossEncoder, featureRevision, graphRevision`. CheiRank / k-core / betweenness
/ communityAffinity / PPR / bfsHops / weightedPathCost are candidates —
**stay out until ablation proves value**. Adding 30 graph features up front
makes attribution impossible.

## Gate structure (GA0–GA9)

| Gate | Proves |
|---|---|
| GA0 | `GraphAnalysisRun` + `GraphProjectionManifest` contracts exist and validate |
| GA1 | Raw PageRank reproducible against a frozen projection |
| GA2 | `pagerankAuthority` promotion proven (existing gate, generalized) |
| GA3 | Louvain vs. Leiden run on the identical frozen snapshot (parity, not quality) |
| GA4 | Community evaluation corpus passes (quality, via `community-taxonomy-policy.ts`) |
| GA5 | CheiRank (reverse-orientation PageRank) lane proven |
| GA6 | k-core topology lane proven |
| GA7 | Betweenness bridge-analysis lane proven |
| GA8 | Per-feature ablation — individual analytical feature's retrieval value measured |
| GA9 | Retrieval promotion — only ablation-winning features added to `FeatureRowV1` |

None of GA1–GA9 are started. This change implements **GA0 only** (Patch A).

## Patch order (A → I), only A done here

| Patch | Contents | Status |
|---|---|---|
| A | Contracts only — `GraphAnalysisRun`, `GraphAlgorithm`, `GraphProjectionManifest`, `GraphMetricResult`, `CommunityAssignment` types. No behavior change. | **DONE this change** |
| B | Persistence — `graph_analysis_runs`, `graph_node_metrics`, `graph_community_assignments`, `graph_communities` tables. Does not touch `atlas_packets`. | **DONE this change** — live-verified, `atlas_packets` confirmed unchanged (140 cols before/after) |
| C | PageRank adapter emits `GraphAnalysisRun` + `graph_node_metrics(pagerank)`, wrapping `neo4j-gds-client.ts::runPageRankClient` (the only one of 5 PageRank code paths found with a live runtime proof against this repo's actual graph, per sibling change `parent-atlas-graph-runtime-enhancement`'s GR2/GR3). Not v1, not v2, not `graphify-authority.mjs`, not `run-pagerank.ts` — the pre-flight audit found all four either dead (zero callers), fixture-only (one-off oracle row, no repeatable writer), or writing to a different store with no relational lineage. See tasks.md "Patch C pre-flight audit" for full findings, including a self-correction made mid-audit before adapter code was written. | **DONE this change** — RUNTIME_SMOKE_PROVEN, `pagerank-analysis-adapter.ts` + `scripts/atlas/run-pagerank-analysis.mts` |
| D | Community adapter — Louvain and Leiden emit the same normalized result shape via one contract, separate algorithm implementations | **DONE this change** — RUNTIME_SMOKE_PROVEN for both algorithms. Generalized into `graph-analysis-runner.ts::runCommunityAnalysis(algorithm, ...)` in Patch E; `scripts/atlas/run-community-analysis.mts` is the current CLI entry point (superseding the earlier Louvain-only `run-louvain-analysis.mts`, kept for backward compat). |
| E | `community-taxonomy-policy.ts` evaluator — coverage/modularity/size-distribution/stability/purity, no promotion decision | **DONE this change** — RUNTIME_SMOKE_PROVEN, `community-taxonomy-policy.ts` + `scripts/atlas/evaluate-community-taxonomy.mts`. Real 5-row live comparison table produced, answering point 10 with data (see tasks.md's "Patch E" section). `subsystemPurity`/`stability` left `null` — no reference taxonomy or multi-run data exists yet to compute them from. |
| F | CheiRank — reversed-orientation PageRank reuse | **DONE this change** — RUNTIME_SMOKE_PROVEN, `cheirank-analysis-adapter.ts` + `scripts/atlas/run-cheirank-analysis.mts`. Live result confirms real, non-redundant signal (top PageRank hubs collapse to near-baseline CheiRank; correlation 0.272). |
| G | k-core — independent scalar metric run | **DONE this change** — RUNTIME_SMOKE_PROVEN, `kcore-analysis-adapter.ts` + `scripts/atlas/run-kcore-analysis.mts`. Requires an all-undirected projection (`codeTopology` rejected by GDS); reuses `atlas_feature_v1`. |
| H | Betweenness — analytical lane only, no ranking use | Not started |
| I | Retrieval promotion — only after evaluation, gated | Not started |

## Cross-references

- `openspec/changes/parent-atlas-graph-runtime-enhancement/` — GR0-GR5 (GDS/APOC
  capability proof, PageRank/BFS/Dijkstra proven, Leiden lane in progress,
  GR5's fragmentation diagnostic is the direct trigger for point 10 above)
- `openspec/changes/parent-atlas-agentic-repair-bundle-integration/` — T0
  precedent for capture-first discipline on large external plans
- `sveltekit-frontend/src/lib/server/graph/graph-contract.ts` — existing
  PageRank-specific run/snapshot schema (audited, not duplicated)
- `sveltekit-frontend/src/lib/server/graph/pagerank-authority-contract.ts` —
  existing raw-vs-promoted PageRank pattern this change generalizes
- `sveltekit-frontend/src/lib/server/graph/pagerank-promotion-gate.ts` —
  existing promotion gate implementation
- `openspec/changes/parent-atlas-unordered-execution-contract/` (2026-08-09)
  — sequences this change's remaining work (Patch H, GA8/GA9) as Phase 1/4/5
  of a 10-phase repo-wide plan; also owns the `AtlasEnvelopeV1` identity/
  revision/idempotency contract (QUIC-inspired: unordered arrival is fine,
  ambiguous identity/order is not) and the found-but-unwired
  `codebase-graph.json` writer (`scripts/index-codebase-fast.mjs`) follow-up;
  the earlier `graphify:map` reference is a stale doc alias, not a live
  script
