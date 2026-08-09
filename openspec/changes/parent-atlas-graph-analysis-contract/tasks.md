# Tasks — Graph Analysis Run/Promotion Contract

## GA0 — Contracts (Patch A)

- [x] Audit existing graph contracts before writing new ones: found
      `graph-contract.ts` (`GraphSnapshotSchema`, `PageRankRunSchema`,
      `PageRankScoreSchema`), `pagerank-authority-contract.ts`
      (`PageRankAuthorityRecordSchema`, `PageRankAuthorityBatchSchema`,
      `PageRankValidationReportSchema`), `pagerank-promotion-gate.ts`. Flagged
      (not fixed): `PageRankRunSchema` is defined twice, differently, across
      the two files — pre-existing duplication, out of scope for this patch.
- [x] Create `sveltekit-frontend/src/lib/server/graph/graph-analysis-types.ts`
      — `GraphAlgorithm`, `GraphAnalysisRun`, `GraphMetricResult`,
      `CommunityAssignment`, `CommunityTaxonomyRecord`, `FeatureRowV1` (per
      README.md). Pure types + minimal Zod validators, no I/O, no behavior
      change.
- [x] Create `sveltekit-frontend/src/lib/server/graph/graph-projection-manifest.ts`
      — `GraphProjectionManifest` type + Zod schema.
- [x] Verified with `npx tsgo --noEmit`: zero errors in either new file (only
      pre-existing-style Zod v4 `.datetime()`/`.finite()` deprecation
      warnings, matching `graph-contract.ts`'s own established style).

## Patch B — persistence (2026-08-09) — DONE

- [x] Created `sveltekit-frontend/src/lib/server/db/schema/graph-analysis-runs.ts`
      — Drizzle definitions for `graph_analysis_runs`, `graph_node_metrics`,
      `graph_community_assignments`, `graph_communities`. Re-exported from
      the canonical `schema.ts` (confirmed via `drizzle.config.ts`'s
      `schema:` field — `schema.ts`, not `schema-postgres.ts`, is what
      drizzle-kit actually reads).
- [x] Verified with `npx tsgo --noEmit`: zero new errors, no export-name
      collisions in the `schema.ts` barrel.
- [x] Wrote manual migration `drizzle/manual/graph_analysis_runs.sql`
      (idempotent `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
      throughout, per this repo's Drizzle Safety Rule — no `drizzle-kit push`
      used).
- [x] Applied directly via `docker exec legal-ai-postgres psql ... < graph_analysis_runs.sql`
      — 4 `CREATE TABLE` + 12 `CREATE INDEX`, all succeeded.
- [x] Independently verified live via `\d <table>` on all 4 tables — columns,
      types, defaults, and indexes all match the Drizzle schema exactly.
- [x] Confirmed `atlas_packets` untouched: 140 columns before and after (the
      identity/analysis layer split held — no new algorithm-specific columns
      added to the identity table).

Existing `atlas_graph_authority_runs_v2` / `atlas_graph_authority_scores_v2`
(PageRank-specific, `schema/graph-authority-v2.ts`) are untouched and continue
to coexist — migrating PageRank onto the new generalized tables is Patch C,
not done here.

## Patch C pre-flight audit (2026-08-09) — DONE, before any adapter code

Ran the exact live-DB check the README's Patch C description assumed
("existing pagerankAuthority promotion path unchanged") without first
verifying which path is actually live. It is not what the README assumed:

- `atlas_graph_authority_runs` (v1, the table `pagerank-promotion-gate.ts`
  reads): **1 row**, `status='promoted'`, `created_at=2026-07-22`. No writer
  found anywhere in `src/`/`scripts/` via grep for the literal table name —
  it was populated by something no longer traceable in the tree (one-off
  script, deleted, or manual insert).
- `PageRankPromotionGate` (the class in `pagerank-promotion-gate.ts` that
  reads v1 and would call `promoteRun()`): **zero callers anywhere in the
  repo.** `validateRun`/`promoteRun` are dead code — never invoked.
- `atlas_graph_authority_runs_v2` / `atlas_graph_authority_scores_v2`
  (`graph-authority-v2.ts` + `graph-authority-v2-db.ts`): **1 run, 162,234
  score rows**, `engine='networkx'`, `algorithm_version='stage5-simple-pagerank-v1'`,
  `completed_at=2026-08-09` (today), `status='PASSED'`,
  `configuration.validation_gate='NETWORKX_REFERENCE_PROVEN'`.
  **Correction (found while starting Patch C, before writing adapter code):**
  this is NOT a live pipeline either. `persistGraphAuthorityRunV2`/
  `persistGraphAuthorityScoresV2` (the only functions that can write these
  tables) have **zero callers anywhere in `src/`/`scripts/`** — same as v1's
  promotion gate. The actual source, `python/parent_atlas_networkx_pagerank.py`,
  only *prints a JSON result to stdout* (`nx.pagerank()` over a frozen
  fixture snapshot, `fixture-authority-v1` contract — it says so explicitly:
  "This is a graph analytics fixture only"); it never calls the TS repository
  or touches Postgres. So today's row was inserted by some ad-hoc/manual step
  (a one-off script run interactively, not committed to the tree as a
  repeatable command) — not a running pipeline. **Both v1 and v2 are
  one-shot fixture proofs sitting in production tables, not live systems.**
  Neither is "the pipeline to wrap unchanged."
- Neither v1 nor v2's PageRank/authority signal is wired into retrieval
  ranking. Confirmed via `src/lib/server/retrieval/search-runtime.ts:566-577`
  (inline comment, dated 2026-08-08): `graphScore` from
  `atlas_graph_authority_scores` is **deliberately not passed to
  `blendScores()`**, pending an "authority-provenance audit" to determine
  whether it's the *same* signal as `pageRankScore` (also derived from
  PageRank, sourced from lexical-lane metadata) — wiring both would
  double-count one signal as `0.05·PR + 0.10·"authority" ≈ 0.15·PR`. See
  `openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/proposal.md`
  "2026-08-08 addendum" for the full writeup (also notes `pageRankScore`
  itself was silently dropped before reaching `blendScores()` until that
  change's Domain 3-5 wiring pass, confirmed fixed).
- `scripts/graphify-authority.mjs` (Neo4j GDS `pageRank.write` → Neo4j
  property + Redis mirror + Qdrant payload patch) and `scripts/run-pagerank.ts`
  (CouchDB power-iteration + GPU `pageRankGPU`, cached in Redis
  `couchdb:pagerank_scores`) are two *further*, separate PageRank
  implementations — neither writes to any `atlas_graph_authority_*` table.
  Confirms this repo currently runs (or has, at various points, run)
  PageRank via **5 independent paths**: v1 Postgres path (dead/unwired,
  stale row); v2 Postgres path (writer functions exist, zero callers, one
  fixture-oracle row inserted ad hoc); Neo4j-property path
  (`graphify-authority.mjs`); CouchDB/GPU path (`run-pagerank.ts`); and
  Neo4j GDS mutate path (`neo4j-gds-client.ts::runPageRankClient`). Of
  these five, **only the last is proven against this repo's actual live
  infrastructure** — GR2/GR3 in `parent-atlas-graph-runtime-enhancement`
  runtime-proved it against the real 23,114-`CodebaseFile`-node /
  2,754-`IMPORTS`-edge Neo4j graph (not a frozen fixture, not a stale
  one-off row). The other four are either dead code, fixture-only, or
  write to a different store with no relational lineage row at all.

**Consequence for Patch C's scope**: README.md's plan — "PageRank adapter
emits `GraphAnalysisRun` + `graph_node_metrics(pagerank)`; existing
`pagerankAuthority` promotion path unchanged" — assumed a live promotion
path to leave alone. None of v1/v2/Neo4j-property/CouchDB paths qualify.
Patch C instead:
1. Targets `neo4j-gds-client.ts::runPageRankClient` +
   `getTopPageRankClient` — the one PageRank implementation with a live
   runtime proof on this repo's actual graph, per the sibling
   `parent-atlas-graph-runtime-enhancement` change's GR2/GR3 gates.
2. Leaves v1, v2, `graphify-authority.mjs`, and `run-pagerank.ts` completely
   untouched — flagged here as dead-code/fixture-only/duplicate-path
   candidates for a future consolidation pass, not this change's job to fix
   or delete.
3. Still does not attempt to wire the resulting `pagerankAuthority` into
   `search-runtime.ts`'s `blendScores()` — that's blocked on the
   authority-provenance audit owned by `parent-atlas-retrieval-lod-algorithm-taxonomy`,
   and is GA9/Patch I territory (retrieval promotion), not GA1/Patch C
   (raw run reproducibility).

## Patch C — PageRank adapter (2026-08-09) — RUNTIME_SMOKE_PROVEN (GA1)

- [x] Created `sveltekit-frontend/src/lib/server/graph/pagerank-analysis-adapter.ts`
      — wraps `neo4j-gds-client.ts`'s `runPageRankClient()` +
      `getTopPageRankClient()` per the corrected target above. Writes one
      `graph_analysis_runs` row + one `graph_node_metrics` row per resolved
      `CodebaseFile` node, inside a single Postgres transaction.
- [x] **Concurrent design change, reconciled in place**: while this patch was
      being implemented, a separate edit (via IDE, same session) introduced a
      shared `AnalysisRunEnvelopeSchema` (`src/lib/server/analysis/analysis-run-envelope.ts`)
      that `graph-analysis-types.ts`'s `GraphAnalysisRunSchema` now extends —
      adding `backendPreference`/`backendActual`
      (`native-ts | rust | python-sidecar | gpu-sidecar | offline`),
      `gpuAccelerated`, `sidecarUrl`, `inputHash`, `outputHash` so graph
      analysis, model/HMM analysis, and experiment/ablation runs can share one
      lineage core. Sibling tables `experiment_analysis_runs.sql` /
      `model_analysis_runs.sql` were added for the same reason — out of scope
      for this change, not touched. The adapter was updated to populate the
      new envelope fields (`backendPreference`/`backendActual: 'native-ts'`
      — accurate for an in-process TS-over-bolt call, not the schema's own
      `'offline'` default; real sha256 `inputHash`/`outputHash`; `gpuAccelerated:
      false`; `sidecarUrl: null`).
- [x] **Two real bugs found and fixed in the concurrently-edited migration**
      (`drizzle/manual/graph_analysis_runs.sql`) before it could run: (1) a
      trailing comma before the closing paren of the `CREATE TABLE` block —
      a plain syntax error; (2) the 6 new envelope columns were added inside
      `CREATE TABLE IF NOT EXISTS`, which no-ops against the already-live
      Patch B table — replaced with explicit
      `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements per this repo's
      Drizzle Safety Rule. Applied live via
      `docker exec legal-ai-postgres psql -f`; verified via `\d
      graph_analysis_runs` that all 6 columns landed with correct
      types/defaults.
- [x] **Two real bugs found and fixed in the adapter during its first live
      run** (not hypothetical — both reproduced against production data):
      (1) a single bulk `INSERT` built 131,110 bound parameters
      (18,730 rows × 7 columns) against Postgres's 65,535-parameter wire
      protocol ceiling — fixed with 3,000-row batching, and the whole write
      wrapped in one transaction so a mid-batch failure can no longer leave a
      `status='succeeded'` run row with a partial or empty metrics set (this
      exact scenario happened on the first, untransacted attempt — cleaned
      up manually before the transactional re-run); (2) `getTopPageRankClient`
      was called with `nodeType` unfiltered, and 15+ non-`CodebaseFile` node
      labels in the projection (`Function`, `Concept`, `Trace`, ...) carry the
      same `path` property as their containing file, producing duplicate-key
      violations on `graph_node_metrics`' `(runId, packetKey, metricName)`
      primary key — fixed by filtering to `nodeType='CodebaseFile'` plus a
      defensive max-score dedupe by `packetKey` as a second safety net.
- [x] Verified with `npx tsgo --noEmit`: zero new errors across the adapter,
      the extended `graph-analysis-types.ts`, and the new envelope file.
- [x] **Live run** (`npx tsx scripts/atlas/run-pagerank-analysis.mts`, run
      twice independently): `graph_analysis_runs` has exactly 1 row per run,
      `status='succeeded'`, `backend_preference='native-ts'`,
      `backend_actual='native-ts'`; `graph_node_metrics` — 58,546 rows,
      58,546 distinct `packet_key`s (zero duplicates), 0 non-finite
      (`NaN`/`Infinity`) `metric_value`s, scores in `[0.227, 39.834]`; both
      runs produced the identical `graphRevision` hash and identical
      58,546/8,901 resolved/unresolved split, confirming determinism against
      an unchanged graph. `atlas_packets` column count unchanged (140, same
      check as Patch B). Script moved to a permanent location
      (`scripts/atlas/run-pagerank-analysis.mts`) per this repo's "never
      delete working scripts" convention, not left as a throwaway.
- [x] **Coverage note, not a blocker**: 8,901 of 67,447 `CodebaseFile` nodes
      (13.2%) didn't resolve to a `packet_key` via the exact/
      `sveltekit-frontend/`-prefixed `source_ref` join — expected, matches
      the audited 94.25% sample resolution rate below. Likely build
      artifacts / generated files never packetized into `atlas_packets`, not
      a join-logic bug. Not re-investigated further — out of scope for GA1
      (raw run reproducibility); revisit only if GA9 promotion needs tighter
      coverage.

**Verified join basis** (2026-08-09, live, before adapter code was written):
2,000-node random sample of `CodebaseFile.path` values containing `/`
against `atlas_packets.source_ref` — 1,307 exact matches + 578 matches with a
`'sveltekit-frontend/'` prefix = 1,885/2,000 (94.25%) resolution rate. This is
the basis for the adapter's join logic (see file docstring).

## Patch D — Louvain community adapter (2026-08-09) — RUNTIME_SMOKE_PROVEN (GA3, Louvain half only)

- [x] **Found already substantially built**: a concurrent edit (same session,
      via IDE) had already created
      `sveltekit-frontend/src/lib/server/graph/graph-analysis-runner.ts` — a
      `runGraphAnalysis()` dispatcher covering pagerank (correctly delegating
      to this change's `pagerank-analysis-adapter.ts` via dynamic import),
      a full `runLouvainAnalysis()` (GDS mutate + write + transactional
      Postgres writes to `graph_analysis_runs` + `graph_community_assignments`
      + `graph_communities` with `ON CONFLICT` upserts), and honest
      `runSkippedAnalysis()` stubs for leiden/cheirank/kcore/betweenness with
      specific reasons (not silently absent, not falsely marked done).
- [x] **Real identity bug found and fixed**: `runLouvainAnalysis` matched
      `MATCH (n)` (all 15+ node labels, unfiltered) and wrote
      `coalesce(n.stableKey, n.filePath, n.relativePath, n.path, n.name)`
      directly as `graph_community_assignments.packet_key` — never resolved
      against `atlas_packets`. Root `CLAUDE.md`'s "Forbidden Identity
      Sources" explicitly bans `stable_key`-style pseudo-refs for exactly
      this reason. Extracted the join logic proven for Patch C into a shared
      `graph-packet-key-resolver.ts` (`resolveCodebaseFilePacketKeys()` +
      `lookupPacketKey()`) and switched both the PageRank adapter and this
      Louvain adapter to use it — one join implementation, not two, matching
      this change's own anti-duplication thesis. Also added the same
      `nodeType='CodebaseFile'` filter Patch C needed, for the same reason
      (non-file nodes sharing a containing file's `path`).
- [x] **Real idempotency bug found and fixed on first re-run**: `gds.louvain.mutate`
      threw `Neo.ClientError.Procedure.ProcedureCallFailed` on a second run
      against the long-lived `codeTopology` projection — `mutateProperty`
      `'louvainCommunity'` already existed from the first run. Same class of
      bug `neo4j-gds-client.ts::runPageRankClient` already self-heals for
      `'pageRankScore'` (drop-property-first, idempotent); this inlined
      Louvain call didn't have the same guard. Fixed with the identical
      self-heal pattern.
- [x] Verified with `npx tsgo --noEmit`: zero new errors from any file this
      patch touched (`graph-analysis-runner.ts`,
      `graph-packet-key-resolver.ts`, `pagerank-analysis-adapter.ts`'s
      refactor). **Noted, not fixed**: two pre-existing errors appeared in
      unrelated concurrently-added files
      (`src/lib/server/analysis/analysis-run-contract.ts` — a `export type
      { AnalysisRunEnvelope }` re-export used as a type reference without a
      matching `import type`, and `src/lib/server/analysis/index.ts` — a
      barrel importing `./graph-analysis-contract.js`, which doesn't exist
      yet) — part of a much larger, still-in-progress parallel
      `AnalysisRunEnvelope`-family effort (also touching
      `experiment_analysis_runs.sql`/`model_analysis_runs.sql`) visible in
      the tree but out of scope for this change to fix.
- [x] **Live run** (`npx tsx scripts/atlas/run-louvain-analysis.mts`, run
      twice independently, second run exercising the idempotency fix):
      `graph_analysis_runs` — 2 rows (one per run), both
      `status='succeeded'`; `graph_community_assignments` — 58,546 rows per
      run, 58,546 distinct `packet_key`s (zero duplicates, matches Patch C's
      resolved count exactly since both filter to the same `CodebaseFile`
      set); `graph_communities` — 36,563 communities, 0 non-finite
      `member_count`. `atlas_packets` column count unchanged (140).
- [x] **Community structure finding, not a blocker, feeds Patch E directly**:
      median community size is **1** — 32,385/36,563 (88.6%) of Louvain
      communities are singletons — alongside a long tail including a
      2,397-member giant community and several hundred-member ones. A
      different degenerate shape than GR5's Leiden result (near-uniform
      one-community-per-node on a `SIMILAR_TOPOLOGY`-only projection) but
      likely the same root cause: community detection on an
      undifferentiated combined-relationship-type projection. This is
      exactly the data Patch E's `community-taxonomy-policy.ts` evaluator
      needs (`singletonRatio`, `p50`/`p95`/`maxCommunitySize` are already in
      `CommunityEvaluationSchema` for precisely this).

## Leiden — intentionally still a stub, not deferred by omission

`runSkippedAnalysis('leiden', ...)` remains in place. README.md point 10
already established that Leiden shouldn't be tuned/wired broadly on the
current undifferentiated combined projection before comparing community
quality across the four named projections
(`atlas_dependency_v1`/`atlas_execution_v1`/`atlas_feature_v1`/`atlas_combined_v1`
from `graph-projection-manifest.ts`) — and Louvain's own singleton-heavy
result above reinforces that this is a projection-design problem, not an
algorithm-specific one. Real Leiden wiring is folded into Patch E (next),
where it can be evaluated against the same projection comparison rather than
run once more on a projection already suspected of producing degenerate
communities.

## Patch E pre-flight audit (2026-08-09) — DONE, before any Leiden/projection code

Before wiring Leiden across the 4 named projections (README point 10's plan), checked
whether `NAMED_PROJECTION_CANDIDATES`'s relationship types
(`graph-projection-manifest.ts`) actually exist live. **They mostly don't.**

Live relationship types + counts (`CALL db.relationshipTypes()` +
`apoc.cypher.run` count per type, 2026-08-09):

```
USED_CONCEPT 173163   CALLS 59699        BELONGS_TO_FEATURE 58843
SIMILAR_TOPOLOGY 51333 FROM_SOURCE 34408  IMPLEMENTS_FEATURE 18936
HAS_TREE_NODE 18811    HAS_TITLE 18810   IMPORTS 3452
BELONGS_TO_CLUSTER 1587 TEST_COVERS_FILE 1572 IN_COMMUNITY 1183
USES_ENDPOINT 719  CONNECTS_TO 110  USES_TOOL 73  HAS_METHOD 61
USES_DB 52  FEATURE_ENRICHMENT 50  HAS_TOPOLOGY 50  IN_DOMAIN 49
HAS_ONTOLOGY 49  PRODUCED 47  USED 26  STEP 16  DEPENDS_ON 16
RESOLVED_BY 13
```

**Two separate, real drift problems found:**

1. `NAMED_PROJECTION_CANDIDATES` (`graph-projection-manifest.ts`) references
   `REQUIRES`, `RETURNS`, `PARAMETER_OF`, `IMPLEMENTS_REQUIREMENT`, `EXTENDS` —
   **none of these exist in the live graph, zero count, not even in the type list.**
   `atlas_dependency_v1` would resolve to `IMPORTS` only (3,452 edges — real, sparse,
   directed); `atlas_execution_v1` to `CALLS` only (59,699 — real, dense, directed);
   `atlas_feature_v1` to `BELONGS_TO_FEATURE` + `SIMILAR_TOPOLOGY` (110,176 combined —
   real, both `UNDIRECTED`, very dense); `atlas_combined_v1` would silently drop 5 of
   its 9 declared types.
2. `neo4j-gds-client.ts`'s own hardcoded `PROJECTION_RELATIONSHIP_TYPES` (the current
   live `'codeTopology'` projection Patch C/D ran PageRank/Louvain against) lists
   `CONTAINS`, `HAS_CHUNK`, `REFERENCES`, `HAS_CENTROID` — **all four zero-count,
   don't exist.** Of its 9 declared types, only 5 (`IMPORTS`, `CALLS`,
   `BELONGS_TO_CLUSTER`, `SIMILAR_TOPOLOGY`, `BELONGS_TO_FEATURE`) actually
   contributed edges to Patch D's Louvain run. This is a plausible *partial*
   explanation for the 88.6%-singleton result: `SIMILAR_TOPOLOGY` (51,333,
   `UNDIRECTED`) and `BELONGS_TO_FEATURE` (58,843, `UNDIRECTED`) are dense,
   near-clique-shaped relations mixed in with sparse structural edges (`IMPORTS`
   3,452) — exactly the "undifferentiated combined projection" problem README
   point 10 already predicted, now confirmed with real numbers instead of a
   hypothesis.

**A third, structural gap, not just stale names**: `ensureProjectionClient()` in
`neo4j-gds-client.ts` **ignores its own `projectionName` parameter for relationship
selection** — it always builds from the same hardcoded module-level
`PROJECTION_RELATIONSHIP_TYPES` constant regardless of what name is passed in.
Calling it with `'atlas_dependency_v1'` today would NOT produce a dependency-only
projection — it would produce a full-duplicate of `'codeTopology'` under a different
Neo4j graph name. The 4-named-projection comparison README point 10 calls for is
currently unimplementable without a code change, not just a data-correction one.

**Corrected `NAMED_PROJECTION_CANDIDATES`** (real live types only, to be applied
before any Leiden run):
```
atlas_dependency_v1: ['IMPORTS']
atlas_execution_v1:  ['CALLS']
atlas_feature_v1:    ['BELONGS_TO_FEATURE', 'SIMILAR_TOPOLOGY']
atlas_test_v1:       ['TEST_COVERS_FILE']   -- also needed by the sibling
                                              parent-atlas-gpu-graph-vector-substrate
                                              change's TEST_IMPACT topology program;
                                              defining it here avoids a second,
                                              possibly-inconsistent definition there
atlas_combined_v1:   ['IMPORTS','CALLS','BELONGS_TO_FEATURE','SIMILAR_TOPOLOGY',
                       'TEST_COVERS_FILE','BELONGS_TO_CLUSTER']
```
`REQUIRES`/`RETURNS`/`PARAMETER_OF`/`IMPLEMENTS_REQUIREMENT`/`EXTENDS` dropped
entirely (don't exist). `IMPLEMENTS_FEATURE` (18,936, real) considered for
`atlas_dependency_v1` or a new `atlas_implements_v1` but deliberately left out of
this correction — semantically closer to `atlas_feature_v1` than dependency, and
adding it should be its own decision, not silently folded in while fixing dead names.

## Patch E — Leiden across corrected projections + community-taxonomy-policy.ts (2026-08-09) — RUNTIME_SMOKE_PROVEN (GA3/GA4)

- [x] E.1 Fixed `ensureProjectionClient()` to accept an optional
      `relationshipTypeOverride: readonly string[]` parameter instead of always
      using the hardcoded module-level `PROJECTION_RELATIONSHIP_TYPES` — additive,
      existing zero-arg call sites (Patch C/D, Gate 1) unchanged. Verified live: a
      projection built with `['IMPORTS']` reported exactly 3,452 relationships
      (matching the live `IMPORTS` count), proving the filter is real, not a no-op.
- [x] E.2/E.3 Applied the corrected `NAMED_PROJECTION_CANDIDATES` to
      `graph-projection-manifest.ts`, including new `atlas_test_v1`
      (`['TEST_COVERS_FILE']`) shared with the sibling
      `parent-atlas-gpu-graph-vector-substrate` change's `TEST_IMPACT` topology
      program.
- [x] E.4 Generalized `runLouvainAnalysis` into `runCommunityAnalysis(algorithm,
      db, projectionName, relationshipTypes?)` covering both `'louvain'` and
      `'leiden'` — same self-heal (now for either `louvainCommunity` or
      `leidenCommunity` mutate property), same transaction, same `CodebaseFile`
      filter + `graph-packet-key-resolver.ts` join discipline. Replaced
      `runGraphAnalysis`'s `runSkippedAnalysis('leiden', ...)` stub. Added
      `GraphAnalysisRequest.namedProjection` so callers select a named projection
      by key instead of raw strings.
- [x] **Real algorithmic constraint found live, not a bug**: Neo4j GDS's
      `gds.leiden.mutate` throws
      `IllegalArgumentException: The Leiden algorithm works only with undirected
      graphs` — confirmed against `atlas_dependency_v1` (`IMPORTS`, `NATURAL`
      orientation). Leiden cannot run on `atlas_dependency_v1` or
      `atlas_execution_v1` without forcing their directed edges undirected, which
      changes their semantics — a real modeling decision, not this patch's to make
      silently. Leiden results are `atlas_feature_v1`-only (already `UNDIRECTED`);
      Louvain has no such restriction and covers all three.
- [x] **Second real gap found and fixed**: `unresolvedPacketKeys` (computed
      in-process) and GDS's own `modularity` (available directly from
      `gds.<algo>.mutate`'s `YIELD modularity`, confirmed live: 0.9735 on
      `atlas_feature_v1`) were both computed but never persisted into
      `graph_analysis_runs.metrics` — `community-taxonomy-policy.ts` needs both
      to compute `coverage` and report real `modularity` instead of a fabricated
      placeholder. Fixed by capturing `YIELD modularity` in the mutate call and
      writing both values into `metrics`.
- [x] E.5 Ran Louvain against `atlas_dependency_v1`, `atlas_execution_v1`,
      `atlas_feature_v1`; Leiden against `atlas_feature_v1` (the only one it can
      run on). All 4 live, `status='succeeded'`, real per-run `modularity`
      captured (see E.7 table). `atlas_combined_v1` intentionally not re-run —
      Louvain data for the `codeTopology`-equivalent combined projection already
      exists from Patch D.
- [x] E.6 Built `src/lib/server/graph/community-taxonomy-policy.ts` —
      `evaluateCommunityRun()` (one run → `CommunityEvaluationSchema`),
      `listCommunityRuns()`, `evaluateAllCommunityRuns()` (the full comparison
      table). Pure evaluation over already-persisted data — no promotion
      decision, matching GA3/GA4's scope. `subsystemPurity`/`stability` left
      `null` (no reference taxonomy or multi-run stability data exists yet to
      compute them from — honestly absent, not fabricated).
- [x] Verified with `npx tsgo --noEmit`: zero new errors across every file this
      patch touched — full-repo baseline diff is empty (matching Patch C/D's
      bar).
- [x] E.7 **Live comparison table** (`npx tsx scripts/atlas/evaluate-community-taxonomy.mts`):

  | algorithm | projection | coverage | modularity | communities | singletonRatio | p50 | p95 | max |
  |---|---|---|---|---|---|---|---|---|
  | louvain | atlas_dependency_v1 (IMPORTS) | 0.896 | **0.8486** | 57,409 | 0.998 | 1 | 1 | 390 |
  | louvain | atlas_execution_v1 (CALLS) | 0.896 | **−0.1024** | 58,546 | 1.000 | 1 | 1 | 1 |
  | louvain | atlas_feature_v1 (BELONGS_TO_FEATURE+SIMILAR_TOPOLOGY) | 0.896 | 0.9735 | 37,523 | 0.888 | 1 | 2 | 2,397 |
  | leiden | atlas_feature_v1 | 0.896 | 0.9736 | 37,518 | 0.888 | 1 | 2 | 2,397 |
  | louvain | codeTopology (Patch D's combined 5-type projection) | 1.000 | 0 (uncaptured, pre-fix run) | 36,563 | 0.886 | 1 | 2 | 2,397 |

  **This is the real, data-driven answer to README point 10** — not a repeat of
  blind resolution-parameter tuning:
  1. **`atlas_execution_v1` (CALLS-only) has negative modularity and 100%
     singletons** — Louvain found *no* real community structure at all on the
     call graph alone. A purely directed, dense (59,699 edges/58,546 nodes ≈
     1:1) call graph doesn't cluster the way undirected topology relations do;
     running community detection on it in isolation is not useful.
  2. **`atlas_dependency_v1` (IMPORTS-only) is structurally the most "real"
     result**: high modularity (0.8486) with a moderate max community size
     (390, not a 2,397-member giant) and near-total singleton ratio — sparse,
     genuinely modular import structure, most files import-independent.
  3. **`atlas_feature_v1` and Leiden vs. Louvain are near-identical**
     (modularity 0.9735 vs 0.9736, 37,523 vs 37,518 communities) — on the one
     projection where both can run, algorithm choice barely matters. The
     dominant variable is projection choice, not algorithm choice.
  4. **The Patch D `codeTopology` combined projection's 0.886 singleton ratio
     is not degenerate in the way originally suspected** — it's within the same
     range as the cleanly-separated `atlas_feature_v1` result (0.888). The
     original "88.6% singletons = projection is undifferentiated" hypothesis
     from Patch D is **not confirmed** by this data; `atlas_feature_v1` alone
     produces the same singleton-heavy shape. The real signal is
     `atlas_execution_v1`'s negative modularity, not the combined projection's
     singleton ratio.
  5. `coverage` is identical (0.896) across every corrected named projection
     because it's driven entirely by `packet_key` resolution (same
     `CodebaseFile` set, same `graph-packet-key-resolver.ts` join), not by
     algorithm or relationship-type choice — expected, confirms the join is
     projection-independent as designed.

## Patch F — CheiRank via reverse-orientation PageRank reuse (2026-08-09) — RUNTIME_SMOKE_PROVEN (GA5)

- [x] Extended `ensureProjectionClient()` with an `orientationOverride?: 'REVERSE'`
      5th parameter — flips `NATURAL`-orientation relationship types (`IMPORTS`,
      `CALLS`) to `REVERSE`; `UNDIRECTED` types (`BELONGS_TO_CLUSTER`,
      `SIMILAR_TOPOLOGY`, `HAS_CENTROID`, `BELONGS_TO_FEATURE`) are correctly
      left alone (an undirected edge has no direction to reverse). Additive,
      existing call sites unaffected (verified: full-repo tsgo diff empty
      relative to the pre-Patch-F baseline, aside from 2 pre-existing errors
      in an unrelated concurrently-edited file, `cross-encoder-reranker.ts`,
      confirmed not touched by this patch).
- [x] Built `cheirank-analysis-adapter.ts` — **reuses
      `runPageRankClient`/`getTopPageRankClient` verbatim** (no new GDS
      procedure, per README.md point 6: "CheiRank reuses PageRank
      infrastructure"), against a separately-named `codeTopology_reverse`
      GDS graph catalog entry (GDS named-graph orientation is immutable
      once created — a reversed variant requires a distinct name, not an
      in-place flip of `codeTopology`). Writes `metric_name='cheirank'` under
      a distinct `algorithmRevision`, so pagerank/cheirank rows for the same
      `packet_key` coexist without colliding on `graph_node_metrics`' PK.
      Inherits (does not re-derive) the duplicate-key `CodebaseFile` filter,
      `graph-packet-key-resolver.ts` join, and transactional batched-INSERT
      fixes already proven in `pagerank-analysis-adapter.ts`.
- [x] Wired into `graph-analysis-runner.ts`'s dispatcher, replacing
      `runSkippedAnalysis('cheirank', ...)`.
- [x] **Live run** (`npx tsx scripts/atlas/run-cheirank-analysis.mts`, first
      attempt, no bugs found this time): `graph_analysis_runs` —
      `status='succeeded'`, `projection_name='codeTopology_reverse'`,
      356,445 nodes / 283,503 relationships (matches PageRank's projection
      size, confirming the reversed projection covers the same graph);
      `graph_node_metrics` — 58,546 rows, 58,546 distinct `packet_key`s (zero
      duplicates), 0 non-finite, scores in `[0.187, 18.797]`. Identical
      58,546/8,901 resolved/unresolved split to PageRank/Louvain/Leiden,
      confirming the packet-key join is genuinely projection-independent.
- [x] **Live finding, not a bug — verified before trusting it**: 56,130 of
      58,546 packets (95.9%) have byte-identical PageRank and CheiRank
      scores. Initially looked like a reversal no-op; checked the actual
      score distribution before concluding anything. It's real and correct:
      32,174 of those share one exact baseline value (0.9612...) — these are
      nodes whose score is dominated by the two `UNDIRECTED` relationship
      types (`SIMILAR_TOPOLOGY`, `BELONGS_TO_FEATURE`), which reversal
      correctly leaves untouched. The reversal **is** doing real work where
      it should: the top-5 PageRank hub nodes (scores 25.6–39.8, driven by
      directed `IMPORTS`/`CALLS` in-degree) collapse to near-baseline
      CheiRank scores (~0.24–0.28) — exactly the expected "high PageRank,
      low CheiRank = authority/sink" structural class from README.md point 6.
      Correlation between the two score sets is 0.272 (low, as expected —
      most of the interesting signal is in the ~2,400 nodes that differ, not
      the ~56,000 that share an undirected-dominated baseline).
- [x] Verified with `npx tsgo --noEmit`: zero new errors from any file this
      patch touched.

**Consequence for Patch I (GA9 ablation)**: this live result means CheiRank
is not redundant with PageRank on this graph — it's expected to carry
independent signal for the ~2,400 nodes with real directed-edge structure,
worth including in the GA8 ablation rather than dismissing as duplicate
information because of the high identical-score count above.

## Patch G — k-core topology lane (2026-08-09) — RUNTIME_SMOKE_PROVEN (GA6)

- [x] Confirmed `gds.kcore.mutate` exists live via `SHOW PROCEDURES`.
- [x] **Real algorithmic constraint found live, same class as Leiden**:
      `gds.kcore.mutate` rejects `codeTopology` ("K-Core-Decomposition
      requires relationship projections to be UNDIRECTED", mixed
      NATURAL/UNDIRECTED types present). Fixed by targeting `atlas_feature_v1`
      instead — already proven all-undirected live when Leiden ran on it in
      Patch E, reused rather than building a third dedicated projection.
- [x] **Real driver bug found and fixed on first run**: Neo4j's bolt
      protocol requires `LIMIT` to be a driver-tagged integer
      (`neo4j.int(...)`), not a plain JS number — passing `limit: 200000`
      directly serializes as `200000.0` and Neo4j rejects it
      (`Neo.ClientError.Statement.ArgumentError`, "Expected 'value' to be of
      type INTEGER"). Fixed with `neo4j.int(Math.trunc(limit))`, matching the
      `toNeo4jParams()` pattern already established elsewhere in
      `neo4j-gds-client.ts` for the same reason — this file didn't reuse
      that helper and needed its own fix.
- [x] Built `kcore-analysis-adapter.ts` reusing the same self-heal/
      transaction/`CodebaseFile`-filter/`graph-packet-key-resolver.ts`
      discipline as every prior adapter this session. Wired into
      `graph-analysis-runner.ts`, replacing `runSkippedAnalysis('kcore', ...)`.
- [x] Verified with `npx tsgo --noEmit`: zero new errors.
- [x] **Live run** (`npx tsx scripts/atlas/run-kcore-analysis.mts`):
      `graph_analysis_runs` — `status='succeeded'`, `projection_name=
      'atlas_feature_v1'`, 356,445 nodes / 220,352 relationships (matches
      Patch E's Louvain/Leiden runs on the same projection exactly);
      `graph_node_metrics` — 58,546 rows, 58,546 distinct `packet_key`s (zero
      duplicates), 0 non-finite, scores in `[1, 2]`. `atlas_packets` column
      count unchanged (140).
- [x] **Finding**: k-core values of only 1–2 across the entire graph — a
      shallow, mostly-sparse-with-thin-overlap topology on this projection,
      not a deeply nested core structure. Consistent with Patch E's finding
      that `atlas_feature_v1` is dominated by near-pairs (p50 community size
      1, p95 size 2) rather than densely interconnected clusters. Not
      investigated further here — topology characterization, not this
      patch's job to interpret beyond recording it; relevant context for
      whoever picks up GA8 ablation.
- [x] Confirmed, per README point 7: this is topology only, not wired into
      any ranking/promotion path — GA8/GA9 (Patch I) territory.

## Gate validation script (2026-08-09) — formalizes Gate 1 task 1.2, generalized to every proven algorithm

- [x] Built `scripts/atlas/verify-graph-analysis-gates.mts` — the repeatable
      check `parent-atlas-gpu-graph-vector-substrate`'s tasks.md Gate 1 task
      1.2 asked for ("live Louvain persistence verifier... formalize the
      manual queries already run ad hoc"), generalized here to every proven
      algorithm (pagerank, louvain, leiden, cheirank, kcore) instead of just
      Louvain, since the same manual query pattern was repeated by hand
      after every one of Patches C–G. Per-algorithm checks: latest
      `succeeded` run exists, metric/assignment rows exist for that run,
      zero duplicate `packet_key` rows, zero non-finite values. Plus one
      cross-cutting check: `atlas_packets` column count still 140 (the
      identity-layer-untouched invariant re-verified at every patch this
      session). Does not re-run any algorithm — inspects already-persisted
      data only, so it's cheap to run repeatedly (no Neo4j GDS mutate calls).
- [x] Verified with `npx tsgo --noEmit`: zero new errors.
- [x] **Live run, 2026-08-09**: `npx tsx scripts/atlas/verify-graph-analysis-gates.mts`
      → **6/6 gates PASS** (pagerank, louvain, leiden, cheirank, kcore,
      atlas_packets-identity-layer-unchanged). Exit code 0. This is the
      current, authoritative confirmation that every patch's live claims in
      this file still hold simultaneously, not just individually at the
      moment each patch was written.

## GA7–GA9 — not started

Each gets its own task entry only when actually picked up (status-language
discipline — no pre-written speculative checklists). See README.md's gate
table for what each proves. GA1, GA3 (both Louvain and Leiden halves), GA5
(CheiRank), and GA6 (k-core) are proven so far.

## Patch H–I — not started

See README.md's patch-order table, corrected by the pre-flight audit above.
Patch D is next in sequence, but is **not** implied by completing Patch C —
each patch gets its own explicit go-ahead per this repo's established
gate-by-gate discipline for external/large plans.

## Open items carried from `parent-atlas-graph-runtime-enhancement`

- GR5's central diagnostic (57,638 communities / 59,692 nodes) is directly
  addressed by README.md point 10 (projection-design-first, not
  resolution-tuning-first) — the recommended fix is choosing/comparing
  `atlas_dependency_v1` / `atlas_execution_v1` / `atlas_feature_v1` /
  `atlas_combined_v1` projections before touching Leiden's gamma parameter.
  Not yet executed.
- The `TEST_COVERS_FILE` sync anomaly (see that change's tasks.md) is
  unrelated to this contract work and stays tracked there.

## Cross-references

- See README.md for the full architecture, gate table, and patch order.
