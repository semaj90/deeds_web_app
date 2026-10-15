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

**CORRECTION (2026-08-10) — a 6th path found live, via MCP tool output, not code-reading
alone.** Called `mcp__trace__atlas_graph_pagerank` (the agent-facing MCP tool backing
`atlas.graph.pagerank`) and paged through its full result set (rank 1 and rank 58,361–58,365
of 58,365 total). **Every row, first to last, returns `pageRankScore: 0.5`** — not a
distribution, a flat constant across the entire corpus. Traced into
`sveltekit-frontend/src/lib/server/ace/atlas-tool-registry.ts:284-319` (`getPageRank`):

```sql
SELECT packet_key, source_ref,
  COALESCE(pagerank_score, authority_score, 0) AS pagerank_score, ...
FROM atlas_packets
WHERE COALESCE(pagerank_score, authority_score, 0) > 0
ORDER BY COALESCE(pagerank_score, authority_score, 0) DESC, packet_key ASC
```

`atlas_packets.pagerank_score` (`schema-atlas-registry.ts:60`, nullable, no writer — consistent
with the finding above that nothing writes PageRank into `atlas_packets`) is NULL for every row,
so every result falls through to `atlas_packets.authority_score` — a column not declared in any
schema file checked this session (present live only; the two `authority_score` columns that do
exist in `schema-postgres.ts`, on `centroid_registry` and `cluster_cards`, are unrelated tables).
That live `authority_score` column returns a uniform `0.5` for all 58,365 rows that have it set
(NULL for the other 61,659 − 58,365 = 3,294 packets, filtered out by the `> 0` clause) — an
untouched default, not a computed authority signal.

**Status update for GA8 projection quality**: the MCP-facing `atlas.graph.pagerank` tool output is
now **CONTRADICTED** as a meaningful PageRank distribution, even though the underlying
Neo4j/GDS PageRank runs remain separately **PROVEN**. These are different claims:

- `neo4j-gds-client.ts::runPageRankClient` and the GA1 run lineage still prove PageRank can be
  computed on the graph projection.
- `atlas_packets.pagerank_score` has no proven writer yet, so the packet-facing projection is
  still unproven.
- `atlas.graph.pagerank` currently returns the uniform `authority_score` fallback, so the tool
  surface is not exposing a live PageRank distribution at all.

Required correction before GA8 uses PageRank:

1. Do not use `atlas.graph.pagerank` output as a PageRank evaluation feature while the fallback
   remains indistinguishable from true PageRank.
2. Identify the canonical producer for packet-level PageRank authority.
3. Decide whether packet-facing PageRank should join the promoted
   `atlas_graph_authority_scores` at query time or materialize a revisioned projection into
   `atlas_packets.pagerank_score`.
4. If materialized, record `graph_revision`, `algorithm_revision`, `normalization_revision`, and
   source authority-run lineage with the projection.
5. Remove or explicitly label the `authority_score` fallback so a uniform legacy/default value
   cannot masquerade as PageRank.
6. Add a distribution sanity gate before promotion: finite values only, non-zero variance, more
   than one distinct score, valid normalization/provenance, and canonical identity join coverage.
7. Add an MCP regression test proving `atlas.graph.pagerank` returns the promoted PageRank
   distribution rather than a constant fallback.

**New promotion invariant**: `distinct(score) > 1` and `variance(score) > ε`.

**Code-level remediation applied in this checkout**: `sveltekit-frontend/src/lib/server/ace/atlas-tool-registry.ts`
now queries and sorts on `pagerank_score` only; `authority_score` is no longer part of the
tool-facing PageRank SQL. A regression test at
`sveltekit-frontend/tests/atlas/atlas-tool-registry.test.ts` asserts that the emitted SQL does
not mention `authority_score` and that row mapping still works against a pagerank-only result.
Live MCP verification is still required to re-check the surfaced `atlas.graph.pagerank` tool.

**GA8 sequencing refinement**:

- GA8.0 fresh structural edges / current identity
- GA8.1 canonical PageRank projection owner
- GA8.2 MCP PageRank distribution sanity
- GA8.3 freeze structural proxy labels
- GA8.4 FeatureRow graph ablation
- GA8.5 GA9 promotion decision

**This is a 6th PageRank-adjacent path**, beyond the five already catalogued above, and the
only one directly exposed through an agent-facing MCP tool: any agent calling
`atlas.graph.pagerank` today receives a plausible-looking, fully-ranked, entirely fake result
list (`metadata.source: "postgres:atlas_packets.pagerank_score"` reports success with no signal
that every score is a default). Not fixed this pass — recorded per this file's own
AGENT EXECUTION INTEGRITY discipline (observed live via tool call, not inferred) and because it
directly bears on Patch I/GA8: any future ablation or retrieval-ranking work that queries
authority via this MCP tool, rather than the one runtime-proven Neo4j GDS path
(`neo4j-gds-client.ts::runPageRankClient`), would silently rank against noise. No owning
OpenSpec file identified for `atlas-tool-registry.ts`'s `getPageRank` specifically — flagged
here since it's a direct extension of this section's audit, not assigned elsewhere.

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

## Patch H pre-flight — UNBLOCKED; freshness gate now satisfied (2026-08-10)

User-specified 4-step precondition for Patch H (betweenness), before any
adapter code: (1) read latest checkpoint, (2) run
`verify-graph-analysis-gates.mts`, (3) require 6/6 PASS, (4) check
`docs/graph/codebase-graph.json` freshness — refresh via Graphify if stale,
since betweenness on a stale graph isn't evidence about the current repo.

- [x] Step 1 — checkpoint read: Patches C–G all `RUNTIME_SMOKE_PROVEN`
      (PageRank, Louvain, Leiden, CheiRank, k-core).
- [x] Step 2 — ran `npx tsx scripts/atlas/verify-graph-analysis-gates.mts`.
- [x] Step 3 — confirmed 6/6 PASS.
- [x] Step 4 — freshness proof is now satisfied by the corrected H13
      canonical publish path and the live `docs/graph/codebase-graph.json`
      refresh. The stale `graphify:map` alias remains a doc issue; the real
      writer is `sveltekit-frontend/scripts/index-codebase-fast.mjs`.

**Patch H implementation status**
- [x] `graph-analysis-runner.ts` dispatches `betweenness` to
      `betweenness-analysis-adapter.ts`.
- [x] `betweenness-analysis-adapter.ts` writes a real
      `GraphAnalysisRun` plus `graph_node_metrics` rows with explicit exact
      vs. sampled `algorithmRevision` variants (code shape, not yet a
      live-verified write — see correction below).
- [x] `src/lib/server/graph/betweenness-analysis-adapter.spec.ts` passes
      when run from `sveltekit-frontend/` via
      `npm exec vitest run src/lib/server/graph/betweenness-analysis-adapter.spec.ts`.
      **This spec does not prove a live run** — see correction below; the
      unit test passing and the adapter actually working against real Neo4j
      are two different claims, conflated in the checklist entry above
      before this correction.
- [x] Latest live betweenness run row verified against the current database:
      `run_betweenness_analysis.mts` now succeeds against `atlas_feature_v1`
      and `verify-graph-analysis-gates.mts` returns **7/7 PASS**.

### CORRECTION (2026-08-10) — adapter had never actually run; two real bugs found live

The checkmarks above describe code shape and a passing spec test, not a proven live run.
Attempted the first-ever live invocation this pass (`npx tsx
scripts/atlas/run-betweenness-analysis.mts`, new file, sampled mode `samplingSize=1000`
per this session's own cost warning) and hit two real bugs in sequence, confirming the
adapter had never successfully executed against live Neo4j before now:

1. **Long/Double type bug (FIXED)** — `betweenness-analysis-adapter.ts`'s
   `gds.betweenness.mutate` call passed `concurrency`/`samplingSize`/`samplingSeed` as plain
   JS numbers. The neo4j-driver bolt protocol serializes these as `Double`; GDS's procedure
   strictly requires `Long`, producing
   `IllegalArgumentException: The value of samplingSize must be of type Long but was Double`.
   Fixed by wrapping all three in `neo4j.int(...)` (the driver's already-imported `neo4j`
   namespace — no new dependency).
2. **Projection orientation incompatibility (NOT FIXED — real design blocker)** — after fix
   1, the call reaches GDS and fails differently:
   `IllegalArgumentException: Combining UNDIRECTED orientation with NATURAL or REVERSE is not
   supported. Found projections: ['BELONGS_TO_CLUSTER (UNDIRECTED)', 'BELONGS_TO_FEATURE
   (UNDIRECTED)', 'CALLS (NATURAL)', 'IMPORTS (NATURAL)', 'SIMILAR_TOPOLOGY (UNDIRECTED)']`.
   The shared `codeTopology` named-graph projection (reused as-is by PageRank/Louvain/Leiden/
   CheiRank/k-core, all of which tolerate mixed orientation) is **structurally incompatible**
   with `gds.betweenness.mutate`, which requires one consistent orientation across the whole
   projection. This is not a config tweak — it needs a **new, betweenness-specific named
   projection** (candidates: all-`UNDIRECTED`, or `NATURAL`-only excluding the three
   inherently-undirected relationship types) added to `graph-projection-manifest.ts`'s
   `NAMED_PROJECTION_CANDIDATES`, which is itself a design decision (which relationships
   should betweenness centrality actually measure paths over?) — not something to guess at.

**Added this pass**: `scripts/atlas/run-betweenness-analysis.mts` (CLI entry point, sampled
mode by default per the cost warning, `--exact` flag for the exact variant — matches the
`run-kcore-analysis.mts`/`run-cheirank-analysis.mts` pattern). Extended
`scripts/atlas/verify-graph-analysis-gates.mts` with a 7th gate (`GA-betweenness`, using the
existing generic `verifyMetricAlgorithm` helper — no new gate-checking logic needed). At the
time of the first failed attempt, the live gate status was **6/7 PASS** and
`GA-betweenness` failed with
`"no succeeded graph_analysis_runs row for algorithm='betweenness'"`.

**RESOLVED (2026-08-10, same day, later)** — a parallel session picked the projection
decision this file left open above: switched `BETWEENNESS_PROJECTION_NAME` from the shared
`codeTopology` to `atlas_feature_v1` (the same already-proven all-consistent-orientation named
projection k-core uses — `NAMED_PROJECTION_CANDIDATES.atlas_feature_v1`), reusing existing
infrastructure rather than inventing a new projection. Live-verified immediately after:

- `npx tsx scripts/atlas/run-betweenness-analysis.mts` (sampled, k=1000, seed=42) →
  **succeeded**, 42.7s elapsed, `nodeCount: 356445`, `relationshipCount: 220352`,
  `metricsWritten: 58546` (matches the k-core gate's `totalRows` exactly — same projection,
  same resolved node count), `unresolvedPacketKeys: 6787`.
- `npx tsx scripts/atlas/verify-graph-analysis-gates.mts` → **7/7 gates PASS**, including the
  new `GA-betweenness` gate (`totalRows: 58546`, `distinctPackets: 58546`, `minScore: 0`,
  `maxScore: 167`) and all 6 previously-existing gates still green.

**Patch H (GA7, betweenness) is now genuinely `RUNTIME_SMOKE_PROVEN`** — a real run exists,
metric rows are non-zero and finite, `packet_key` count matches distinct packets exactly, and
the identity-layer gate (`atlas_packets` column count unchanged) still passes. Not yet checked
against every clause of the acceptance gate listed in this file's pre-flight section (score
non-negativity across all 58,546 rows individually, not just min/max; full run-lineage
completeness fields) — the gate script's summary statistics are consistent with a healthy run
but weren't individually re-derived row-by-row this pass.

**Per this file's own explicit rule, unchanged: do not promote anything from this.** Patch I
(GA8 ablation) is the only place that decides whether CheiRank, k-core, community assignments,
or betweenness actually earn a `FeatureRowV1` slot — a successful run is not the same claim as
"this signal improves retrieval," and this file's README explicitly warns against conflating
the two.

**Governance work completed this session, unaffected by the above block**:
Runtime Owner Deduplication gate (`CLAUDE.md` rule, `docs/architecture/
runtime-ownership-{registry,baseline}.json`,
`scripts/atlas/audit-runtime-ownership.mjs` + test, `npm run
atlas:audit:ownership`) — see
`openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/tasks.md`'s "OD"
section for the full record. Audit status: PASS, 0 new violations.

## Patch I — pre-flight audit (2026-08-10) — REAL BLOCKER FOUND, not started

Gated on Patch H per README.md's patch-order table and the user's explicit
"after H, don't immediately promote anything" instruction above. Patch H is done (7/7),
the graph is freshly refreshed (see `parent-atlas-tensor-residency-integration/tasks.md`'s
graph-refresh record), so this patch is procedurally unblocked — but a pre-flight check
before writing any ablation code found a real, foundational gap.

**GA8 ("per-feature ablation — individual analytical feature's retrieval value measured")
has no ground truth to measure against.** Checked the two most plausible existing candidates
for a labeled retrieval-quality eval set:
- `tests/exact-retriever-recall-baseline.spec.ts` — tests `escapeLike`/`extractQuerySignals`
  signal-extraction logic only, no database, no labeled query→packet ground truth.
- `tests/retrieval-quality-regression.spec.ts` — fully mocked unit test (fetch/db/redis all
  `vi.mock`'d), tests domain-routing/fallback logic shape, not real retrieval quality against
  real data.

**Neither is a golden set.** There is no existing "for query X, packets {A,B,C} are the
correct answer" data anywhere found in this repo. Without that, GA8 cannot honestly produce a
real "adding PageRank/CheiRank/k-core/betweenness improves recall by N%" result — any such
number would have to be either fabricated or measured against an ad-hoc invented ground truth,
both of which violate this session's own evidence discipline (see the AGENT EXECUTION
INTEGRITY rules — no promoted claims without observable, non-fabricated proof).

**This is a genuine design decision, not a research task solvable by more grepping.** Real
candidate approaches for constructing ground truth on Atlas's actual codebase corpus (none
attempted yet — recorded as options, not a decision made unilaterally):
1. **Structural proxy labels** — for a sample of functions/files, treat their *actual real
   importers/callers* (from the already-live `IMPORTS`/`CALLS` Neo4j edges) as "relevant"
   packets for a query built from that function's own docstring/summary. Cheap, derivable from
   data that already exists, but conflates "structurally related" with "actually what a human
   would want retrieved" — a real methodology risk, not a free lunch.
2. **Operator-authored small golden set** — a human (the repo's own maintainer) hand-labels a
   few dozen real queries against this actual codebase with known-correct packet_keys. Most
   defensible ground truth, but requires operator time and doesn't scale to a large ablation
   sweep without more labeling effort.
3. **Historical repair/retrieval traces as weak labels** — if/when `trace_packet_events` (the
   table just built for `execution_utility`, still empty) ever accumulates real
   `selected`/`evidence_used`/`test_pass` events, those could retroactively double as weak
   retrieval-relevance labels. Not usable today — same "schema exists, data doesn't" gap as
   `execution_utility` itself.

**STOP — did not pick a methodology or build any ablation code.** This decision changes what
GA8 actually measures and is not mine to make unilaterally. Recorded here so it's visible
before any future session (or this one, if directed) commits to one approach. Until a ground
truth methodology is chosen, GA8/GA9 remain **NOT_STARTED**, not merely "not started because no
one got to it" — they're blocked on a real, named methodological gap.

### GA8 current open work (live repo state)

The current blocker is still graph-input repair before any ablation/promotion work:

- [ ] Re-derive `IMPORTS` from current live-tree paths only.
- [ ] Reject `.claude/worktrees/...` sourceRefs during projection.
- [ ] Normalize `CALLS` targets so generic symbols like `$state` do not dominate.
- [ ] Emit a fresh graph revision and provenance receipt.
- [ ] Build the structural-proxy golden set from that repaired revision.
- [ ] Run the GA8 ablation harness against the golden set.
- [ ] Promote to GA9 only after GA8 passes with the repaired inputs.

**Operator selected option 1 (structural proxy labels from real graph edges), 2026-08-10.**
Attempted to build it immediately; found a second, deeper real blocker before writing any
golden-set data — recorded here rather than pushed past:

- `CALLS` edges (59,699 live) connect `CodebaseFile → Function`, but `Function.name` values are
  frequently generic/library calls (e.g. `$state`) rather than meaningful queryable symbols —
  a poor source for "query built from a function's own docstring."
- `IMPORTS` edges (3,452 live) are file→file, structurally the right shape, but **every single
  node's `.path` property on both sides points into `.claude/worktrees/agent-a38668f2/...`** —
  a temporary agent worktree, the same class this session's own memory already records as
  freed/deleted (20GB of `.claude/worktrees/agent-*` cleaned up earlier in the project's
  history). Confirmed live via direct query (`MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile)
  RETURN a, b` — sample paths shown, not inferred). **None of these paths match
  `atlas_packets.source_ref`'s current live repo-relative paths** (`src/lib/...` style) — the
  entire `IMPORTS` edge set in Neo4j is stale relative to the actual current repository tree.
- By contrast, the `atlas_feature_v1` projection (`BELONGS_TO_FEATURE`/`SIMILAR_TOPOLOGY`
  relationships) that Patch H's betweenness work ran against **does** use live, current-tree
  paths — confirming Neo4j holds a **mix of live and stale data written at different times**,
  not a uniformly fresh graph. This is itself worth flagging as a governance/data-quality
  concern independent of GA8, not something to silently work around inside this gate.

**Net effect**: building the structural-proxy golden set as scoped requires either (a)
re-deriving `IMPORTS`-equivalent structural relationships from a source that's confirmed live
and current-tree (e.g., re-run the same live-tree AST/import-facts pipeline that populated
`atlas_feature_v1`'s relationships, or query Postgres directly if any table holds real current
import/dependency facts — not checked yet), or (b) accepting `CALLS`→`Function` despite its
generic-symbol noise and filtering to only meaningful (non-builtin) callee names. **Neither
attempted — this is a second real design/data-quality decision, not resolvable by more
querying alone**, and stacking a second unilateral choice on top of the first (which
methodology) risks building a golden set on a foundation nobody signed off on. Stopped here;
did not fabricate a golden set from the stale worktree paths or silently substitute a different
relationship type without flagging it.

## Open items carried from `parent-atlas-graph-runtime-enhancement`

- GR5's central diagnostic (57,638 communities / 59,692 nodes) is directly
  addressed by README.md point 10 (projection-design-first, not
  resolution-tuning-first) — the recommended fix is choosing/comparing
  `atlas_dependency_v1` / `atlas_execution_v1` / `atlas_feature_v1` /
  `atlas_combined_v1` projections before touching Leiden's gamma parameter.
  Not yet executed.
- The `TEST_COVERS_FILE` sync anomaly (see that change's tasks.md) is
  unrelated to this contract work and stays tracked there.

## Session cross-cutting to-do list (2026-08-10) — consolidated, not all owned by this file

Recorded here as a single index since these span multiple OpenSpec changes and would
otherwise only exist in conversation history. Each item names its actual owning file —
this section is a pointer/index, not a duplicate of the full record.

**Native addon architecture clarification (new note, applies wherever `tensorrt_bridge.node`
is discussed)**: the compiled addon exports two independent capability lanes that must not be
conflated when triaging failures:
- **GPU tensor lane** (LibTorch/CUDA): `pageRankGPU`, `attentionScoreGPU`, `kmeansWithCentroids`,
  `trainSOM`, `autoencoderEncode/Decode`, `pcaProject`, `graphSimilarity`, etc.
- **CPU SIMD lane** (simdjson, AVX2/SSE, no GPU/CUDA involvement whatsoever): `simdJsonParse`,
  `simdJsonValidate`, `simdJsonExtractNumbers`, `simdJsonBackend`.

They're compiled into the same `.node` file for build convenience only. A bug in one lane
implies nothing about the other — e.g. `simdJsonParse` being broken (see below) does not mean
GPU functions are unhealthy, and `getCudaMemory()`'s false-success bug (see below) does not
mean simdjson is unhealthy.

1. **Duplicate sidecar processes on port 8095** — real, live, unresolved. PID 63952 (bare
   host `C:\Python313\python.exe python\miniforge_nlp_sidecar.py`, bound `127.0.0.1:8095`)
   and the real `miniforge-nlp-sidecar` Docker container (bound `0.0.0.0:8095` via Docker's
   proxy) are both live simultaneously; Windows loopback routing likely favors the more
   specific host-process bind, meaning most in-repo `http://127.0.0.1:8095` calls hit the
   host process, not the container most documentation assumes is authoritative. No owning
   OpenSpec file identified yet — needs one, or an addition to
   `parent-atlas-nlp-sidecar-feature-compiler`. Needs an operator decision on which process
   should be the sole survivor before any code changes.
2. **Native addon: `getCudaMemory()` false-success bug** — `simd-bridge/cpp/
   libtorch_graph_impl.cpp`'s `#ifdef __CUDACC__` guard means the real `cudaMemGetInfo()`
   call never compiles into a plain-C++ (non-`nvcc`) build; falls through to a silent
   `rc=0, free_mb=0, total_mb=0` fake-success rather than an honest failure or a working
   query. Root-caused via direct code read, not fixed — the CUDA Runtime API does not
   actually require `nvcc` compilation (just `#include <cuda_runtime.h>` + linking `cudart`),
   so the guard is unnecessarily restrictive. Fixing requires a native-addon rebuild. No
   owning OpenSpec file yet.
3. **Native addon: `simdJsonParse()` returns unparsed input string** — confirmed via
   `.tmp/gpu-bridge-probe.json`'s own recorded probe output (`raw` field identical to the
   input string, not a parsed object); classified `NOT_PROVEN` by
   `scripts/startup-gpu-bridge-probe.mjs`'s own classifier. Root cause not traced into the
   N-API binding code this session — only the symptom confirmed. No owning OpenSpec file yet.
4. **WSL2 `atlas-rapids-cu13` RAPIDS environment is real, live, and under-documented in this
   file's own repo** — see `parent-atlas-gpu-graph-vector-substrate/tasks.md`'s "STALE
   PREMISE CORRECTION (2026-08-09)" section for the full record (cuvs 26.06.00, cugraph
   26.06.00, torch 2.13.0+cu130 with CUDA available, a working `atlas_rapids_sidecar.py`
   with `/v1/knn/exact` + `/v1/knn/cagra` already coded, a real passed recall/latency
   benchmark from 2026-07-10). Not currently running (nothing bound to port 8098). Needs:
   (a) manual launch inside WSL2 to re-verify live, (b) full reconciliation against
   `parent-atlas-graph-retrieval-proof/tasks.md`'s GS1.37-1.4x+ entries before any new
   Gate 4-6 code is written in `parent-atlas-gpu-graph-vector-substrate`, (c) an operator
   decision on which of those two OpenSpec files owns this work going forward.
5. **Root-vs-sveltekit-frontend `docs/graph/codebase-graph.json` duplication** — resolved
   this session (see this file's "Scoped codebase-graph.json refresh" section above for the
   fix and `docs/archive-manifest.json` for the archival record). Listed here only for
   completeness of the session index.
6. **Representation-lineage writer duplication** — resolved by a parallel session during this
   one; see `parent-atlas-semantic-768-canonical-contract/tasks.md`'s "R1 CORRECTION" section
   for the full audit trail (encoderRevision now sourced from a versioned contract constant,
   `'embeddinggemma-native-768-v1'`, not a mutable Ollama tag; single writer confirmed,
   9/9 tests passing live).
7. **This file's own Patch H betweenness work** — see the correction section immediately
   above. Two real bugs found, one fixed (Long-vs-Double `neo4j.int()` wrapping), one
   resolved by a parallel session (switched `BETWEENNESS_PROJECTION_NAME` from the shared
   mixed-orientation `codeTopology` to the already-proven, uniformly-`UNDIRECTED`
   `atlas_feature_v1`). Live-reverified this session: 42.7s run, `nodeCount: 356445`,
   `metricsWritten: 58546`, `unresolvedPacketKeys: 6787`; full 7/7-gate
   `verify-graph-analysis-gates.mts` run confirms `GA-betweenness` PASS alongside the other
   six algorithms and the `atlas_packets`-identity-layer-unchanged gate.

   **Deeper schema finding (not yet acted on)**, surfaced by user critique this session: the
   fix above sidesteps rather than closes the underlying gap. `neo4j-gds-client.ts`'s
   `ensureProjectionClient()` already builds **per-relationship-type** orientation correctly
   (`isUndirected` check per type at line ~179 — `BELONGS_TO_CLUSTER`/`SIMILAR_TOPOLOGY`/
   `HAS_CENTROID`/`BELONGS_TO_FEATURE` forced `UNDIRECTED`, everything else `NATURAL` or the
   `orientationOverride`). But `graph-projection-manifest.ts`'s `GraphProjectionManifestSchema`
   records only a single `orientation: 'NATURAL'|'REVERSE'|'UNDIRECTED'` field for the whole
   projection — it cannot truthfully describe a mixed-orientation graph like
   `atlas_combined_v1` (which mixes `IMPORTS`/`CALLS` NATURAL with `BELONGS_TO_FEATURE`/
   `SIMILAR_TOPOLOGY`/`BELONGS_TO_CLUSTER` UNDIRECTED — the exact same mixed shape that broke
   betweenness on `codeTopology`). Confirmed **currently latent, not an active bug**: grepped
   `GraphProjectionManifestSchema` — it is only re-exported by `graph-analysis-contract.ts`,
   never `.parse()`'d or persisted by any live adapter (pagerank/leiden/louvain/cheirank/
   kcore/betweenness all build their `GraphAnalysisRun` directly with a single
   `projectionRevision` hash, no `orientation` field). So today's 7/7 gate pass is not at
   risk. **Recommendation**: before ever running an algorithm against `atlas_combined_v1` (or
   any future mixed-orientation projection) and recording it via `GraphProjectionManifestSchema`,
   change `orientation` from a single enum field to a per-relationship-type map
   (`Record<string, ProjectionOrientation>`), keyed the same way `ensureProjectionClient()`
   already computes it internally — otherwise the manifest will silently misdescribe the graph
   it ran against, which is exactly the reproducibility failure this schema exists to prevent.
   **Update: fixed this session (CONTRACT_EXPRESSIVENESS_HARDENING, not a Patch H reopen).**
   `graph-projection-manifest.ts` rewritten to V2: `relationships: Record<string,
   GraphRelationshipProjection>` (per-type `sourceType`/`projectedType`/`orientation`/
   `properties`/`aggregation`) replaces the single global `orientation` field;
   `computeRelationshipProjectionHash()` canonicalizes+sorts by `projectedType` before
   sha256 (order-independent, sensitive to orientation/aggregation/properties/inclusion
   changes); `expandLegacyOrientation()` added as an explicitly-`@deprecated`,
   fail-closed (throws on empty input) reconstruction path for the old shape — not needed
   for any live caller (confirmed zero persisters again post-rewrite), included because it
   was cheap and documents the old→new mapping precisely. All prior exports
   (`NAMED_PROJECTION_CANDIDATES`, `NamedProjectionCandidate`, `ProjectionOrientationSchema`,
   `ProjectionOrientation`, `GraphProjectionManifestSchema`, `GraphProjectionManifest`) kept
   stable — the only consumers of this module (`betweenness-analysis-adapter.ts`,
   `kcore-analysis-adapter.ts`, `graph-analysis-runner.ts`, `graph-analysis-contract.ts`'s
   re-export) only ever used `NAMED_PROJECTION_CANDIDATES`, confirmed via grep before and
   after.

   Added `tests/atlas/graph/graph-projection-manifest.spec.ts` (4/4 pass live): (1)
   homogeneous all-NATURAL projection validates, (2) heterogeneous mixed NATURAL/UNDIRECTED
   projection validates — the direct regression test for the gap Patch H exposed, (3) hash
   differs when only orientation changes, (4) hash is stable under relationship-map key
   reordering.

   Verified post-rewrite, live: `npx tsgo --noEmit -p tsconfig.json` shows zero new errors
   in `graph-projection-manifest.ts` or any of its four consumers (pre-existing unrelated
   baseline errors in three unrelated route files are unchanged before/after — confirmed by
   diffing the tsgo output, not just eyeballing "PASS"); re-ran
   `verify-graph-analysis-gates.mts` and got **7/7 PASS again**, including `GA-betweenness`
   — this was a pure schema-expressiveness addition, zero behavior change to any adapter.
8. **T2-lineage (FeatureVector5 source provenance) is at 4/5, proven with real live data —
   owned by `parent-atlas-tensor-residency-integration/tasks.md`, not this file.** Summary only:
   `authority_norm` (pagerank, 94.9% coverage), `domain_fit` (domain_confidence, 7.2%),
   `ast_signal` (real `web-tree-sitter` AST facts, `tanh(symbol_count/5)`, 5.5%), and
   `entropy_norm` (byte-trigram Engram, robust-MAD-tanh normalization, 90.3% of a
   4,480-row corpus) are all proven with real coverage numbers, none fabricated or
   zero-filled for missing rows. `execution_utility` has a real, live, additive schema now
   (`trace_packet_events` n-ary table + `atlas_execution_utility` rollup target,
   `migrations/20260810b_trace_packet_events.sql`) but **zero real rows** — checked and
   confirmed no existing telemetry (`trace_runs`, `trace_events`) can backfill it, so this
   stays explicitly `NOT_PROVEN` until real system traffic populates it. `feature_matrix_5`
   remains blocked on 5/5. This item exists here only as a pointer since GA8/GA9 (this
   file's own next patch) will eventually want real, non-fabricated features to ablate
   against — the two programs (graph-ranking vs. feature/tensor) stay independent until
   GA8 explicitly combines them, per that file's own recorded design principle.

## Patch (pending) — Topology Propagation, Symbol Extraction, SOM/KMeans (2026-08-11, NOT_PROVEN)

Source: `docs/PHASE-3-GPU-ACCELERATION-ROADMAP.md` Stage 3B/3C, flagged by the
user for OpenSpec inclusion. **Not yet cross-checked against this file's own
findings** (e.g. Patch C found `atlas_graph_authority_runs` has no live
writer, `codeTopology` singleton-ratio issues, `community_id` provenance is
partially untraceable) — before running any command below, re-verify against
this file's own community/topology findings above; do not assume the roadmap
doc's npm scripts are wired just because they're named.

**Stage 3B — Topology Propagation & Symbol Extraction (2-3 days, per roadmap doc)**
- [ ] 3B.1 `community_id` backfill: `npm run atlas:backfill:community-id[:analyze|:verify]`
      — target >95% coverage on `glyph_records`. **Verify these npm scripts
      exist and are wired before running** — this file's Patch C already
      found evidence of untraceable/orphaned community-id provenance; check
      whether this backfill script is the intended source of truth or
      another parallel path.
- [ ] 3B.2 Symbol extraction (ATLAS-3A): `drizzle/manual/atlas-3a-symbol-map.sql`
      → `npm run atlas:extract-symbols[:dry|:audit]` → `atlas_symbol_map`
      table (40K+ symbols linked to packets + topology). Check for overlap
      with `parent-atlas-pass-fabric`'s PF-G0 (canonical packet identity
      writer) — symbol extraction that links to `packet_key` inherits that
      same "is the writer proven" question.

**Stage 3C — SOM & KMeans Topology (2-3 days, per roadmap doc)**
- [ ] 3C.1 SOM 20×20 training on 768-dim embeddings via
      `scripts/atlas/train-som-topology.py` (WSL/Python) →
      `npm run atlas:som:assign-packets` → `atlas_packets.som_cell_x/y`.
      **Dimension flag RESOLVED (2026-08-11)**: `docs/PHASE-3-GPU-ACCELERATION-ROADMAP.md`
      predated the 768-dim canonical policy (doc dated 2026-07-19, policy
      established 2026-07-27) — updated all 384→768 references in that doc
      (CLI flags, npm script, executive summary). Confirmed no other 384
      references remain in that file. **Still unverified**: whether
      `scripts/atlas/train-som-topology.py` itself exists and actually reads
      a `--dim` flag correctly — the doc edit doesn't prove the script does
      the right thing, only that the doc no longer tells you the wrong thing.
- [ ] 3C.2 KMeans (k=64/128/256) → `atlas_packets.kmeans_cluster_id` +
      Redis `centroid:kmeans:*`. Same 768-dim fix applied to the doc.

**Recommendation for whoever picks this up**: the doc-level 384-vs-768
conflict is fixed, but verify the actual Python script
(`scripts/atlas/train-som-topology.py`) exists and behaves as documented
before running training — doc correctness and code correctness are two
different claims.

## Patch (2026-08-24) — double `packet:` prefix bug in graph-snapshot-materializer, + file-level PageRank backfill path

Started as an investigation into "does `codebase_chunk_index.page_rank_score`
being 0/52,417-populated (vs. `code_features.page_rank_score` at
1,477/1,477) have a usable backfill path via the existing custom NetworkX
PageRank oracle?" (see the "5 competing PageRank implementations" audit in
`CLAUDE.md`'s Duplication Prevention section, which this patch is squarely
inside of).

**Bug found and fixed** (live-verified, not from a report): `graph-snapshot-
materializer.ts` built packet-type node keys as `` `packet:${packet.packetKey}` ``
unconditionally in two places (packet-node construction, and the
`DERIVED_FROM` edge's `sourceNodeKey`), but `packet.packetKey` already
carries the `packet:` prefix for 58,304/61,660 live `atlas_packets` rows.
Result: every packet-type node in every materialized graph snapshot gets
`nodeKey = packet:packet:<hash>` instead of `packet:<hash>`. Confirmed live:
54,078 of 162,234 rows in `atlas_graph_authority_scores_v2.node_key` carry
this exact bug today. Fixed both call sites (conditional on
`startsWith('packet:')`, not an unconditional strip, because 61 legacy
`atlas_packets` rows still store a bare unprefixed hex key). Two existing
tests had baked the bug in as an expected value — corrected both. Commit
`03820ae695`.

A third occurrence of the identical pattern exists in
`packet-lod-manifest.ts`'s `buildPacketLodCacheKey` (Service Worker LOD
cache keys) — confirmed **zero live callers** outside its own test file, so
left unfixed as flagged-but-dormant, consistent with this repo's "record
what you found, even when you don't fix it" rule.

**Backfill path found and verified (read-only), not yet applied**: the
correct join for `codebase_chunk_index → atlas_graph_authority_scores_v2` is
`source_ref`, NOT `packet_key`/`metadata->>'packet_key'`. Verified live:
- `codebase_chunk_index.source_ref = atlas_packets.source_ref` resolves
  100% (52,417/52,417).
- `codebase_chunk_index.metadata->>'packet_key'` is a **decoy** for this
  join — it's a different identity scheme entirely (1,392 `sha256:<hash>` +
  13,251 bare UUIDs, 0 matching `atlas_packets.packet_key`'s `packet:<hash>`
  format). This is the same field the `project-graphify-embeddings-qdrant.mjs`
  packet_key projection fix (commit `7fda58e04f`) now writes into Qdrant —
  worth noting its actual join value against `atlas_packets` is currently
  zero, a separate open finding.
- Full chain `codebase_chunk_index.source_ref → atlas_packets.source_ref/
  packet_key → 'packet:' || packet_key = atlas_graph_authority_scores_v2.node_key`
  resolves 5,182/52,417 rows (~10%) against the single existing `run_id`.
  Coverage is partial because the authority-scores graph snapshot itself
  only covers a subset of nodes, not an identity-resolution failure.
  Coverage should increase after the double-prefix fix above is picked up
  by the next `stage5-pagerank-authority-validated.mjs` run (new node keys
  will no longer need the `'packet:' ||` prefix-add workaround at all, once
  a fresh snapshot is exported).

**Not yet done**: the actual `UPDATE codebase_chunk_index SET
page_rank_score = ...` backfill for the resolvable rows. Left open pending
an explicit decision on whether `atlas_graph_authority_scores_v2` is the
`CANONICAL_OWNER` for this signal (per this file's own 5-implementation
audit, that classification decision has not been made) — running a
backfill from a not-yet-classified owner risks the same "pick a winner
silently" failure mode this file's governance section exists to prevent.

## Patch (2026-08-29) — cuGraph/NetworkX PageRank parity is already computed and sitting unpromoted; not the same lane as the Aug 21 hardening doc's RAPIDS claim

Investigated this session per an operator request to align the Neo4j→NetworkX/cuGraph PageRank
picture. Confirmed live, on disk, not assumed:

- **The parity oracle pipeline already ran successfully once** (Aug 12, per
  `sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json`):
  `status: PASS`, 162,234 nodes / 108,156 edges, `pagerankCorrelation: 1`,
  `pagerankTopKOverlap: 1`, `pagerankMaxDelta: 4.89e-9`, Louvain ARI/NMI both 1.0. Both
  `python/graph_snapshot_parity_networkx_oracle.py` and
  `python/graph_snapshot_parity_cugraph_oracle.py` executed live against the frozen
  `nodes.parquet`/`edges.parquet` artifact (producer revision
  `identity-contract-v1+tree-sitter-typescript-v1`).
- **The per-node scores from that run are still on disk, unused**:
  `sveltekit-frontend/docs/reports/graph-snapshot-parity/cugraph-scores.ndjson` and
  `networkx-scores.ndjson` (per-node `{gpuNodeId, pagerankRaw}`, written by the oracle's
  `--scores-out` flag — confirmed by reading `graph_snapshot_parity_cugraph_oracle.py`'s
  `write_ndjson()`), plus `cugraph-louvain.ndjson`/`networkx-louvain.ndjson`
  (`{gpuNodeId, communityId}`). `nodes.parquet` itself carries the `gpu_node_id → graph_node_key`
  join table needed to map these back to real node identity (confirmed via
  `export-graph-snapshot-parity-parquet.mts`'s DuckDB projection query,
  `row_number() OVER () - 1 AS gpu_node_id, key AS graph_node_key`).
- **`atlas_graph_authority_scores` (the table `PageRankPromotionGate.validateRun()` reads,
  `sveltekit-frontend/src/lib/server/graph/pagerank-promotion-gate.ts`) is source-agnostic** — it
  keys on `(graph_snapshot_id, node_key)` plus a `run_id`/`algorithm` tag, and the gate validates
  whatever `run_id` it's given (L1-norm sum≈1, no NaN/Infinity, percentile/band derivation,
  identity match). Nothing in the gate assumes the scores came from Neo4j GDS.
- **The gap**: nothing has ever joined the Aug 12 cuGraph NDJSON output through the
  `gpu_node_id → graph_node_key` map and inserted it into `atlas_graph_authority_scores` as a new
  `run_id`. So despite root `CLAUDE.md`'s Aug 26 correction explicitly saying Neo4j's own GDS
  PageRank run (3,667 stale nodes) should **not** be treated as canonical, nothing has actually
  replaced it in the table ACE/Karpathy-blend-adjacent consumers would read from. Proof exists;
  promotion does not.

**Not the same lane as `parent-atlas-graph-pagerank-okf-fanout-hardening`'s (2026-08-21) "Decide
on RAPIDS/cuGraph GPU PageRank parity — genuinely NOT_PROVEN" note** — that doc is about
`atlas-rapids-pagerank-client.ts` (a different RAPIDS PageRank client, exercised by
`pagerank-parity.spec.ts` against a Neo4j GDS comparison), not about the
`graph_snapshot_parity_*_oracle.py` pair this patch covers. Both are real, separately-tracked
PageRank paths — do not conflate "RAPIDS parity not proven" (the Aug 21 doc's claim, about a
different client) with "cuGraph/NetworkX parity not proven" (false — it was proven Aug 12, just
never promoted). Flag this cross-doc terminology collision explicitly rather than let it cause a
future session to re-litigate a already-proven parity result under the wrong name.

**Not done this pass** (write path touches canonical authority scores that live ranking consumers
may read from — scoping only, no Postgres write attempted):

- [ ] Write a promotion script (proposed name: `scripts/atlas/promote-cugraph-pagerank-parity.mjs`)
      that: reads `cugraph-scores.ndjson` + `nodes.parquet`'s `gpu_node_id → graph_node_key` map,
      joins to real `node_key`, computes `pagerank_l1` (L1-normalize raw scores to sum=1 — reuse
      whatever normalization `pagerank-authority-contract.ts` already formalizes, don't
      reimplement), derives `authority_percentile`/`authority_band` the same way, and INSERTs into
      `atlas_graph_authority_scores` with a fresh `run_id` and `algorithm` tag (e.g.
      `cugraph-pagerank-parity-v1`, distinct from `neo4j-gds-pagerank-mutate-v1`).
- [ ] Run the new `run_id` through `PageRankPromotionGate.validateRun()` — should PASS given the
      Aug 12 receipt's own correctness proof, but must actually be run, not assumed.
- [ ] **Explicit operator decision required before flipping any consumer** to read this new
      `run_id` as canonical instead of the existing `neo4j-gds-pagerank-mutate-v1` one — this
      changes live ACE/Karpathy-blend-adjacent ranking behavior for anything downstream of
      `atlas_graph_authority_scores`, which is exactly the kind of hard-to-reverse, shared-system
      change that needs confirmation before executing, not silent promotion.

## Patch (2026-08-29, second pass) — audited all live PageRank stores to find "the right one"; corrected a wrong Aug 9 claim

Continued the patch above by checking every PageRank-adjacent Postgres store live, not just the
one this patch already knew about. Full inventory, by evidence quality:

| Store | Live row count | Evidence quality |
|---|---|---|
| **`atlas_graph_authority_scores_v2` / `_runs_v2`** | 1 run (PASSED), 162,234 scores | **Strongest candidate.** `engine=networkx`, `algorithm_version=stage5-simple-pagerank-v1`, `validation_gate=NETWORKX_REFERENCE_PROVEN`, `topology_hash` = **exact match** to the Aug-12 parity receipt's `graphRevision` (`dff9006fef66e...`) — same frozen graph. Written by a real script (`stage5-pagerank-authority-validated.mjs`, per this file's own 2026-08-24 patch above) — **not** stdout-only, contradicting the Aug 9 ownership-registry claim below. |
| `atlas_graph_authority_scores` / `_runs` (non-v2) | 1 run properly promoted (40,754 nodes, L1 sum=0.99999...) **+ 3 orphan snapshots with no matching run row** (2,902 / 3,255 / 3,253 nodes) | Messier — the orphan snapshots were inserted without a run row, so `PageRankPromotionGate.validateRun()` can't validate them (its `runData` query needs a matching `atlas_graph_authority_runs` row). One orphan snapshot's L1 sum is **0.923, not ≈1** — a real, live normalization bug in this table today. |
| `graph_node_metrics` | 351,276 rows | Owned per the Aug 9 registry by `graph-analysis-runner.ts`'s Neo4j-GDS backend (`neo4j-gds-pagerank-mutate-v1`). This is the exact source root `CLAUDE.md`'s 2026-08-26 correction says should **not** be treated as canonical PageRank truth anymore. |
| Neo4j node properties (`pageRank`/`graphAuthorityScore`) | 3,667 stale nodes | Same 2026-08-26 correction: predates the NetworkX/cuGraph pivot, unreconciled. |
| Aug-12 oracle NDJSON (`cugraph-scores.ndjson`/`networkx-scores.ndjson`) | 162,234 rows on disk, 0 in any DB table | Most rigorously proven (independent cross-backend correlation=1, maxDelta=4.9e-9) but never promoted anywhere — see the first patch above. |

**Correction to `docs/architecture/runtime-ownership-registry.json`** (edited this session): its
`known_existing_duplication` entry for `atlas_graph_authority_scores_v2` claimed `FIXTURE_ONLY`,
"writer functions have zero callers... only prints JSON to stdout." **Live-checked and wrong** —
there's a real promoted run via a real writer script. Old entry kept in the registry (marked
superseded) for audit trail rather than deleted, per this repo's archive-not-delete convention;
a corrected entry added above it.

**Why `_v2` is the strongest candidate, not yet declared the winner**:
- Same graph revision as the independently-proven Aug-12 cuGraph↔NetworkX parity result — but
  nobody has cross-checked whether `_v2`'s actual per-node PageRank *values* agree with the Aug-12
  oracle's independently-computed values for that same graph. PageRank is deterministic given a
  fixed graph/damping/iteration count, so if they match, that's strong additional confirmation;
  if they don't, `stage5-simple-pagerank-v1` may differ from the oracle in a way worth
  understanding before trusting it. **Not done this pass** — flagged as the next concrete check.
- 54,078/162,234 existing rows carry the double `packet:packet:` prefix bug (writer fixed
  2026-08-24 going forward; existing rows not backfilled) — a fresh re-run or a backfill rewrite
  is needed before this table is fully joinable against `atlas_packets`/`codebase_chunk_index` at
  its real 100% coverage rather than the current ~10% resolvable subset.
- **The CANONICAL_OWNER decision itself has not been made** — per this file's own governance
  section (the "one canonical owner per capability" rule), declaring `_v2` canonical unilaterally
  here would repeat exactly the failure mode this file exists to prevent. This patch presents the
  strongest-evidenced candidate and the specific gaps left before that call can be made
  confidently — the call itself is left open for explicit operator/next-session decision.

## Patch (2026-08-29, third pass) — ran the cross-check; `_v2`'s stored run does NOT match the oracle where it matters. Reverses this file's own prior-pass recommendation.

Ran the specific check the second-pass patch above proposed: joined `_v2`'s live `pagerank_raw`
values (exported to CSV) against `cugraph-scores.ndjson` via `nodes.parquet`'s
`gpu_node_id → graph_node_key`, using DuckDB. Full methodology and numbers below — this
supersedes the second-pass patch's "strongest candidate" framing for `_v2`.

**Aggregate correlation looks perfect and is misleading**: 162,234/162,234 rows joined,
`pearson_corr = 0.9999999999999997`. On its own this looks like strong confirmation.

**Top-50 rank overlap is zero.** The nodes `_v2` ranks highest and the nodes the Aug-12 cuGraph
oracle ranks highest — on the exact same frozen graph revision — **share no members at all**
(`overlap_count = 0` out of 50). The near-perfect Pearson correlation is an artifact of 162,234
nodes almost all having tiny, near-identical scores (a hugely fragmented graph — the Aug-12
receipt itself reports `componentCount: 54078` on 162,234 nodes, average component size ~3) — a
statistic dominated by the long flat tail, blind to disagreement at the ranked head, which is the
part that actually matters for an "authority" signal.

**The specific rows with the largest disagreement** are all `tree:*`-kind nodes (not `packet:*`),
all sharing identical values within each side — oracle: `1.062295363830944e-05`, `_v2`:
`2.4963940974148454e-06` — a consistent ~4.26x systematic ratio, not random noise. That points at
a structural difference in how the two computations handle this graph (dangling-node/isolated-
component treatment is the leading hypothesis given the 54,078-component fragmentation — cuGraph's
`pagerank(alpha=0.85, max_iter=100, tol=1e-8)` vs `_v2`'s `stage5-simple-pagerank-v1`
(`damping_factor: 0.85`, but only **10** `ran_iterations`, `did_converge: true`) — same damping,
10x fewer iterations, and unconfirmed whether `stage5-simple-pagerank-v1` treats the graph as
directed/undirected or redistributes dangling-node mass the same way cuGraph does. **Not
confirmed** — would require reading the actual `stage5-pagerank-authority-validated.mjs`/algorithm
source, not done this pass.

**Corrected conclusion**: `_v2`'s existing stored run should **not** be trusted as equivalent to
the properly cross-validated (networkx↔cugraph, correlation=1, maxDelta=4.9e-9) Aug-12 oracle
result, despite matching graph revision hash. The graph identity/revision matching is real and
useful (confirms both ran on the same frozen snapshot), but the *algorithm* that produced `_v2`'s
numbers materially disagrees with the oracle at the top of the ranking — which is the part a
downstream "authority" consumer (ACE/Karpathy blend) would actually use. **Neither existing
Postgres table is "the right one" right now.** The only PageRank computation on this graph with
independent cross-backend confirmation is the Aug-12 oracle's own NDJSON output — still unpromoted
to any table (see first patch above).

**Revised recommendation**: promote the Aug-12 oracle's NDJSON output directly (per the first
patch's unstarted promotion-script task), rather than trying to rehabilitate `_v2`'s existing run.
If `_v2`'s pipeline is kept going forward, its algorithm needs to be reconciled against the
oracle's parameters (iteration count at minimum; dangling-node handling needs checking) before its
future runs are trusted either.

## Patch (2026-08-29, fourth pass) — cuGraph oracle output promoted, gate-validated, deliberately NOT flipped live

Built and ran `sveltekit-frontend/scripts/atlas/promote-cugraph-pagerank-parity.mts` (dry-run
default, `--apply` to write). Two real blockers were caught by inspecting the schema/live
consumers *before* writing, not discovered by trial and error:

1. `atlas_graph_authority_runs.algorithm` has `CHECK (algorithm = 'pagerank')` — a literal-only
   constraint, no column exists to tag which implementation/backend produced a run. Fixed the
   script to use the bare literal; the distinguishing tag (`cugraph-pagerank-parity-v1`) is
   recorded here and in the script's own log output, not in the DB row.
2. **`src/lib/server/retrieval/feature-matrix.ts` is a live ranking consumer** — it queries
   `atlas_graph_authority_scores JOIN atlas_graph_authority_runs WHERE r.status = 'promoted'` with
   **no run_id pin**. The existing run (`05d5c943-...`, Neo4j-GDS-sourced, 40,754 nodes) already
   has `status = 'promoted'`. Inserting a second `'promoted'` row would have made this query
   nondeterministically blend or collide with live ranking the moment the transaction committed —
   caught before running `--apply`, not after. Fixed the script to insert with
   `status = 'passed'` instead (a valid value per the table's CHECK constraint) — gate-validated,
   inert, not read by `feature-matrix.ts`'s live query.

**Result (live, this session)**:
- `run_id = 625f3468-1a49-44ad-9fea-3a6ca25e7fa1`, `graph_snapshot_id = f5aa34f3-327e-42da-a4af-9dad15987b3a`
- 162,234/162,234 score rows inserted, 0 duplicate node_key collisions, all node_key values
  single-prefixed correctly (packet-kind nodes use `nodes.parquet`'s already-correct `packet_key`
  column, not the double-prefixed `graph_node_key` — sidesteps the known Aug-24 bug rather than
  promoting it forward)
- `PageRankPromotionGate.validateRun()`: **all 7 gates PASS** — `PAGERANK_RAW_PRESERVED`,
  `L1NORM_EXPLICITLY_APPLIED`, `L1_SUM_VALIDATION`, `AUTHORITY_PERCENTILE_DERIVED`,
  `AMBIGUOUS_PAGE_RANK_SCORE_RETIRED`, `POSTGRES_PROMOTION_GATE`, `QDRANT_PAYLOAD_CONTRACT`.
  `observedL1Sum = 1.000000000000185`, `rawFiniteCoverage = 1`, `normalizedFiniteCoverage = 1`,
  `nodeParity = 1`, `duplicateNodeCount = 0`.

**Still status='passed', not 'promoted' — deliberately.** This run is now the best-evidenced
PageRank data in the database (independently cross-backend-proven source, gate-validated, correct
node identity), but it is not live. Flipping it to `'promoted'` is a separate, explicit-operator
step this script never performs, and it has a real wrinkle: `feature-matrix.ts`'s query has no
run_id pin, so simply flipping the new run to `'promoted'` without ALSO retiring the existing
Neo4j-GDS run's `'promoted'` status would recreate the exact nondeterministic-collision problem
this pass just avoided. Any future flip must handle both sides atomically (e.g. an UPDATE that
demotes the old run and promotes the new one in the same transaction) — not attempted here.

**Recommended before declaring `_v2` canonical** (not started):
- [ ] Cross-check `_v2`'s existing per-node `pagerank_raw` values against `cugraph-scores.ndjson`
      (join via `nodes.parquet`'s `gpu_node_id → graph_node_key`, strip `_v2`'s double-`packet:`
      prefix where present) for a sample of nodes — confirm agreement or characterize disagreement.
- [ ] Re-run `stage5-pagerank-authority-validated.mjs` now that the double-prefix writer bug is
      fixed, to get a clean full-coverage `_v2` snapshot without the prefix workaround.
- [ ] Fix the 0.923 L1-sum normalization bug in the non-v2 `atlas_graph_authority_scores` orphan
      snapshot (`2693eab9-fe04-4367-9a72-e0f0f1b8416c`) or determine whether that snapshot should
      simply be deleted/archived as an incomplete run.
- [ ] Only then: explicit CANONICAL_OWNER classification decision for the PageRank signal across
      `_v2`, non-v2, and `graph_node_metrics` — recorded here, not re-derived from scratch again.

## Cross-references

- See README.md for the full architecture, gate table, and patch order.
- `docs/PHASE-3-GPU-ACCELERATION-ROADMAP.md` — source for the pending
  Topology/SOM/KMeans patch above (unverified against this file's findings).
- `openspec/changes/parent-atlas-pass-fabric/` — PF-G0 (canonical packet
  identity writer) is a shared prerequisite with Stage 3B.2 symbol extraction
  above; do not resolve independently in both places.

### Cross-linked from a separate thread (2026-08-29): this golden set is the real unblock for `parent-atlas-neural-prefill-encoder`'s `LAMBDAMART-RANK-01`

A separate session thread (recall/diversity/MMR benchmarking for `latent_256`, see
`openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md`'s `LATENT-DIVERSITY-02` /
`MMR-LAMBDA-SWEEP-01` sections) independently confirmed the same conclusion this file already
reached: no human-labeled golden query→relevant-packet set exists anywhere in this repo, and
that thread's whole comparison methodology has been running on a **silver** standard (lexical
keyword match) precisely because of that gap. `LAMBDAMART-RANK-01` in that thread is explicitly
gated on the same golden set this file already scoped.

**Feasibility check completed (2026-08-29, second pass): the re-derivation path this file names
is a dead end, not just unlocated.** `grep -rl "atlas_feature_v1"` returns nothing under
`scripts/atlas/`. Broadened to `BELONGS_TO_FEATURE`/`SIMILAR_TOPOLOGY` across the whole repo —
the one plausible writer candidate found, `src/lib/server/graph/pagerank-som-alignment.ts`
(note: **root** `src/`, not `sveltekit-frontend/src/`), turns out to be genuinely orphaned code:
an identical copy already sits archived at
`deeds_labs/archive/2026-08-22/orphaned-root-src-tree/...` (root `src/` was flagged and archived
as orphaned that day), and a repo-wide `.ts` search for any import of
`pagerank-som-alignment` returns **zero references**. The live copy still on disk at the
un-archived path is unwired dead code, not a runnable pipeline.

**Conclusion**: "re-run the same live-tree AST/import-facts pipeline" does not point to a
findable, live, runnable artifact. Either it was itself since orphaned/archived, it was a
one-off Cypher/manual operation never captured as a reusable script, or it exists somewhere this
two-pass search didn't reach. Building the golden set's structural-proxy labels therefore likely
requires writing a **new** live-tree AST/import extraction step, not resurrecting an existing
one — a materially bigger task than "re-run X." This is itself the useful finding: it changes
the honest size estimate for unblocking `LAMBDAMART-RANK-01`/`GA8` from "re-run one script" to
"build one script," and that should inform whoever scopes it next.

**No new work started here** — this is a cross-reference + one bounded feasibility check, not a
methodology decision or an attempt to build the golden set. The two real blockers this file
already names (stale `.claude/worktrees/...` paths in `IMPORTS`, generic-symbol noise in
`CALLS`) remain exactly as scoped above. Whoever picks this up next should treat both
`GA8`/`GA9` here and `LAMBDAMART-RANK-01` in the neural-prefill-encoder thread as consumers of
the *same* eventual golden set — build it once, not twice.

### HANDOFF (2026-08-29): the golden set now exists — here's exactly what's built and what isn't

**Built and pushed this session, in order**:
1. `scripts/atlas/extract-live-tree-imports-v1.mjs` — fresh `IMPORTS` extraction, every edge
   verified against a real file on disk at extraction time (not read back from Neo4j's stale
   data). 4,668 files scanned, 9,218 edges. Output: `.tmp/atlas/live-tree-imports-v1.ndjson`
   (gitignored — **not committed, re-run the script to regenerate it**). Report:
   `docs/reports/live-tree-imports-extraction-v1.json`.
2. `python/build_structural_proxy_golden_set_v1.py` — implements the already-chosen
   `STRUCTURAL_PROXY_IMPORTERS` methodology on top of (1). 646 golden entries (query text = a
   file's real summary, relevant packets = that file's real importers,
   `min_importers_threshold=2`). Output: `.tmp/atlas/structural-proxy-golden-set-v1.ndjson`
   (gitignored — **re-run both scripts in order to regenerate**). Report:
   `docs/reports/structural-proxy-golden-set-build-v1.json`.

**Explicitly NOT built** — the next real steps, in priority order:
- [ ] **A GA8 ablation harness does not exist yet** (`find scripts/atlas -iname "*ablation*"`
  returns nothing). This file has referenced "run the GA8 ablation harness against the golden
  set" since before this session without one being built. Building it is the actual next step
  for GA8/GA9 specifically: run the graph-feature-augmented ranking vs. baseline against the 646
  entries, measure real (not silver) recall/precision.
- [x] **CORRECTED, 2026-08-29 (later same day): `LAMBDAMART-RANK-01`'s real Recall@10/MRR@10 is
  NOT directly computable from this golden set, and this was checked, not assumed.**
  `python/benchmark_golden_proxy_relevance.py` attempted exactly the re-run described in the
  now-superseded bullet above. A 5-entry smoke test found **zero** relevant packets appearing
  anywhere in the top-50 semantic pool for **any** sampled entry. Traced to real ground truth,
  not a benchmark bug — a diagnostic script's own `row_number() OVER (...)` bug (window function
  computed only over 2 pre-filtered rows, giving a false "rank 1, 2" relative to each other, not
  their true corpus-wide rank) was found and fixed before trusting the negative result; the
  corrected check confirms it. **Real finding: `IMPORTS` is a structural code relationship, not
  a semantic one — a file's summary does not reliably predict its importers' summaries.** The
  golden set may still be valid for `GA8`'s graph-feature-augmented-ranking evaluation (which
  doesn't need semantic proximity between query and relevant packet), but it does **not**
  directly serve the `latent_256`/MMR semantic-retrieval Recall/MRR recomputation this bullet
  originally planned. That specific use case needs different ground truth — likely the
  operator-authored hand-labeling option (option 2 in this file's original methodology list),
  not a structural proxy. Receipt: `docs/reports/golden-proxy-relevance-eval-v1.json`.
- [ ] **Spot-check a sample of the 646 entries by hand** before trusting them further — this is
  a structural *proxy*, and the methodology's own selection note already flagged "structurally
  related != necessarily what a human would want retrieved" as a real risk, not a formality. No
  human review has happened yet.
- [ ] **Consider lowering/raising `MIN_IMPORTERS_THRESHOLD` (currently 2)** and re-running to see
  how entry count and quality trade off — not explored, one knob with an obvious next experiment.
- [ ] `NOT_STARTED`, unchanged from before this session: the two original graph-input blockers
  (stale `.claude/worktrees/...` paths in the *existing* Neo4j `IMPORTS`, generic-symbol noise in
  `CALLS`) are now moot for the golden-set purpose specifically (worked around via fresh
  extraction), but remain real, separate data-quality problems in live Neo4j if anything else
  still reads those edges — not investigated or fixed this session.

### GA8 ablation CONFIRMED at full scale (2026-08-29, same day): PageRank measurably improves ranking

`python/benchmark_ga8_graph_feature_ablation.py`, run against the complete 646-entry golden set
(zero skipped). Two real bugs found and fixed en route (documented in the two commits directly
preceding this one): a `packet_key`-vs-`source_ref` identity mismatch joining
`atlas_graph_authority_scores`, and a pool-dilution flaw (injecting a query's *full* 1-hop
`IMPORTS` neighbor set, not just the golden set's known-relevant packets, produced pools of
hundreds-to-thousands of candidates for hub files and made top-10 recovery near-impossible
regardless of ranking policy).

**Full-sample result** (n=646, `BLEND_SEMANTIC_WEIGHT=0.7`, untuned):

| Policy | avg recall@10 | avg MRR@10 |
|---|---|---|
| `semantic_only` | 0.0412 | 0.0444 |
| `semantic_plus_pagerank` | **0.1117** (2.7x) | **0.1285** (2.9x) |

This is now a credible, full-sample finding, not a smoke-scale artifact — confirmed identical
direction and similar magnitude to the earlier n=10 run. **`GA8`'s central question (does adding
graph authority features improve ranking on this proxy ground truth) has a real, positive,
reproducible answer.** Receipt: `docs/reports/ga8-graph-feature-ablation-v1.json`.

**Caveats that remain, honestly**: (1) ground truth is the `STRUCTURAL_PROXY_IMPORTERS` golden
set — structural, not human-verified; (2) `BLEND_SEMANTIC_WEIGHT=0.7` was never swept — an
obvious next experiment mirroring the `MMR_LAMBDA` sweep methodology already used in the
`latent_256` thread; (3) absolute recall/MRR values are still low in absolute terms (0.11/0.13)
— PageRank helps relative to the semantic-only baseline, but neither policy is "good" yet in
absolute terms on this ground truth. This does not promote graph features into any live ranking
path — that remains a separate, later, deliberate decision, same discipline as the `latent_256`
thread throughout.

### `BLEND_SEMANTIC_WEIGHT` sweep (2026-08-29, same day): caveat (3) resolved, and it changes the finding

`python/sweep_ga8_blend_weight.py`, full 646-entry golden set, weight grid `[0.0 .. 1.0]` step
0.1. Builds each entry's candidate pool exactly once (identical construction to the confirmed
ablation, including the pool-dilution fix) and evaluates every grid weight against that same
pool — no extra embedding calls per weight. The `weight=0.7` row reproduces the confirmed
ablation's numbers to 12 decimal places (`0.11172189085217102` recall, exact match), which
validates the harness is measuring the same thing.

**Full grid result** (n=646):

| weight (semantic share) | avg recall@10 | avg MRR@10 |
|---|---|---|
| 0.0 (pure PageRank) | **0.2604** | **0.2854** |
| 0.1 | 0.2330 | 0.2737 |
| 0.2 | 0.2156 | 0.2639 |
| 0.3 | 0.1978 | 0.2484 |
| 0.4 | 0.1816 | 0.2279 |
| 0.5 | 0.1607 | 0.2042 |
| 0.6 | 0.1360 | 0.1702 |
| 0.7 (the "confirmed" default) | 0.1117 | 0.1285 |
| 0.8 | 0.0657 | 0.0691 |
| 0.9 | 0.0438 | 0.0491 |
| 1.0 (pure semantic) | 0.0412 | 0.0444 |

Recall and MRR decrease **monotonically** as semantic weight increases — every value beats 0.7,
and the best value in the grid is 0.0 (drop semantic score from the ranking formula entirely).
0.7 was never a good choice; it was a carried-over default that happened to still beat
semantic-only, which is a much weaker claim than "0.7 is a good blend weight."

**This is very likely NOT the finding it looks like, and must not be reported as "just use pure
PageRank."** The golden set's relevance label is itself graph-structural — a packet counts as
"relevant" iff it is a real `IMPORTS`-graph importer of the query file — and PageRank is a
centrality measure computed from that same `IMPORTS` graph. A packet that is heavily imported
(high PageRank, since PageRank is driven by in-edges) is, close to by construction, more likely
to itself *be* an importer of other central files too (hub files import hub files). So "PageRank
alone predicts IMPORTS-relevance well" is closer to measuring self-consistency of the import
graph than it is to proving graph authority helps *semantic* retrieval quality. The monotonic
decline as semantic weight rises may just mean the semantic signal is irrelevant noise **for
this specific structural label**, not that graph authority is a generally superior ranking
signal. Caveat (1) above (proxy, not human-verified ground truth) was always the load-bearing
one; this sweep sharpens rather than resolves it — it shows the earlier 0.7-weight positive
result was directionally real but the specific weight was arbitrary, and a naive reading of
"sweep says use weight=0.0" would be a stronger, less warranted claim than the data supports.

**What this does NOT change**: no production ranking path reads `BLEND_SEMANTIC_WEIGHT` or any
graph-authority feature — this remains measurement-only (`canonical_authority: false`). The
open, still-correct next step (from the original golden-set build) is a human-labeled semantic
relevance set, which would let this exact same sweep methodology answer the real question
(does graph authority help *semantic* relevance) without the circularity risk above.
Receipt: `docs/reports/ga8-blend-weight-sweep-v1.json`.

### LLM-judged independent relevance test (2026-08-29, same day): the circularity hypothesis is confirmed, but so is a second, different circularity

No human labeling capacity is available in this session. As a partial substitute for the
still-open "human-labeled relevance set" next step, built an LLM-judged relevance signal instead
(`python/build_llm_judged_relevance_set.py`) — explicitly labeled `evidence_tier:
LLM_JUDGED_PROXY`, `not_human_verified: true` in every receipt, never conflated with the stronger
human-verified tier. Local `ornith-1.5-9b` (the only live generation-capable model found; Ollama
only serves embedding/vision models currently) judges, per sampled query, which of the top-50
semantic-ANN candidates a developer would genuinely want as related context — given ONLY the
query file's summary and each candidate's summary/path, blind to the `IMPORTS` graph and to
PageRank scores entirely.

**Real bug found and fixed en route**: the model is a thinking/reasoning model (`reasoning_content`
streams before `content`, matching this repo's already-documented Gemma4 streaming behavior even
though this isn't Gemma4). `max_tokens=900` was silently insufficient against a ~40-candidate
judging prompt — reasoning consumed the entire budget, `content` stayed empty, and every judgment
silently came back as zero relevant candidates (looked like "the model found nothing relevant,"
was actually "the model never got to answer"). Caught by inspecting raw output, not by trusting
the empty-array result. Fixed by raising to `max_tokens=4000`, confirmed real judgments after.

Ran the full 60-entry sample, 0 skipped at build time. 33/60 entries had at least one LLM-judged
relevant candidate (27 had none — a legitimate judgment, not a failure, and excluded from the
sweep as "no positive signal to measure recall against," same exclusion logic used throughout
this thread). Confirmed near-zero overlap with `IMPORTS`-derived relevance (2/60 entries had any
overlapping packet at all) — this is testing a materially different relevance definition, not
restating the same one under a different name.

**Sweep result against this independent signal** (n=33, `python/sweep_llm_judged_relevance.py`,
reuses `sweep_ga8_blend_weight.py`'s pool construction unchanged):

| weight (semantic share) | avg recall@10 | avg MRR@10 |
|---|---|---|
| 0.0 (pure PageRank) | 0.3088 | 0.4454 |
| 0.5 | 0.3882 | 0.4732 |
| 0.9 | **0.4458** | 0.6556 |
| 1.0 (pure semantic) | 0.4442 | **0.7410** |

The trend **inverts** relative to the IMPORTS-based sweep: recall/MRR now rise (mostly)
monotonically with semantic weight, peaking near-pure-semantic instead of near-pure-PageRank.
This is real, useful confirmation of the circularity concern flagged in the prior section — on a
relevance signal not derived from the `IMPORTS` graph, PageRank does not dominate; if anything
blending it in hurts relative to semantic alone.

**This result has its own alignment issue and must not be reported as clean vindication of
"just use semantic similarity."** The LLM judge was shown only candidate/query *summary text* and
asked to judge relevance from that text alone — the same textual signal the semantic-ANN
embeddings are themselves computed from. So "semantic cosine score correlates with the LLM's
text-based relevance judgment" is partly circular too, via a different mechanism than the
PageRank case: not graph-structure alignment, but text-similarity alignment (both the retriever
and the judge are operating on the same summary text). Put plainly: **neither sweep in this
thread is a clean, independent verdict.** The IMPORTS-based sweep favors PageRank because PageRank
is graph-derived and so is the label. The LLM-judged sweep favors semantic similarity because the
judge and the ranker are both text-derived. The genuinely open question — does graph authority
meaningfully improve ranking on a relevance definition independent of both the import graph and
raw text similarity (i.e., actual human developer intent) — remains unresolved. A real
human-labeled set, built from what developers actually click/want rather than from either proxy,
is still the only way to close this cleanly.

Receipt: `docs/reports/ga8-blend-weight-sweep-llm-judged-v1.json`. Underlying judgments:
`.tmp/atlas/llm-judged-relevance-v1.ndjson` (gitignored, not committed — regenerable via
`python/build_llm_judged_relevance_set.py`).

### External critique review — GA8-HARDEN-FINAL claims checked against live code (2026-08-30)

Same pasted external critique reviewed for the P0/P1 candidate-feature-fabric claims (see
`parent-atlas-candidate-feature-execution-fabric/tasks.md`, same date) also proposed 6 hardening
items against this GA8 ablation thread, framed as `GA8-HARDEN-FINAL`. Unlike the earlier
candidate-fabric claims (all found stale/already-fixed), these were checked and found to be
**real, currently unimplemented** — this pipeline genuinely does not yet have them:

1. `pagerank_l1` NULL → fail closed — **not implemented.**
   `pagerank-authority.ts::resolvePageRankAuthority()` returns `l1: null` on a non-finite value
   and `pickPageRankAuthorityScore()` silently falls through to `raw` then `legacy` — a soft
   fallback, not a fail-closed rejection.
2. Graph provenance receipt SHA-256 verify + field-consistency parse — **not checked**; would
   need to confirm whether `docs/reports/ga8-blend-weight-sweep-v1.json` /
   `ga8-blend-weight-sweep-llm-judged-v1.json` are checksum-verified anywhere downstream, or only
   produced and trusted as-written.
3. LLM judge request explicit seed + model/server/sampler revision binding — **not implemented.**
   `grep -n seed python/build_llm_judged_relevance_set.py` found zero hits; the judge calls
   `ornith-1.5-9b` with no recorded seed, so a judgment is not deterministically replayable.
4. nDCG eligibility rule (`any grade > 0` for nDCG, `grade >= 2` for MRR/recall) — **not
   checked in detail**; nDCG/MRR computation exists widely across
   `scripts/atlas/benchmark-retrieval-ndcg10.mjs` and others, but whether this specific
   two-tier eligibility split is applied wasn't verified line-by-line.
5. `metricRevision` constant (e.g. `NDCG_EXP2_GAIN_LOG2_DISCOUNT_V1`) — **not implemented.**
   No such constant or equivalent metric-identity string found anywhere in `python/` or
   `scripts/atlas/`.
6. Degenerate min-max (zero-range) feature detection — **not implemented.** No
   `DEGENERATE_FEATURE` marker or equivalent found; a min-max normalization over a zero-range
   feature would currently produce a silent `0.5` rather than being flagged as meaningless.

**This is a different situation from the candidate-feature-fabric review**: those claims
described code that already existed (the critique was stale). These six describe gaps that are
genuinely still open in this live, actively-developed GA8 measurement pipeline. **Not
implemented this session** — flagging as a real, scoped follow-up rather than acting
unprompted on a careful, self-aware research thread (see the circularity discussion two entries
above) without explicit go-ahead. Whoever picks this up: items 1, 3, 5, 6 are the well-scoped,
low-risk ones (single-function changes); items 2 and 4 need a closer read of the receipt/eval
code before scoping.

### GA8-HARDEN-FINAL items 1/3/6 implemented (2026-08-30, same session)

Picked up the three low-risk items flagged as open in the prior section, after checking real
callers first (per this repo's own duplication-prevention discipline).

- [x] **Item 1 (pagerank_l1 NULL fail-closed)**: `pagerank-authority.ts::resolvePageRankAuthority()`
  now returns an additive `l1Status: 'ABSENT' | 'PRESENT' | 'CORRUPT'` field, distinguishing a
  legitimately-absent `pagerank_l1` (rows predating this column -- normal, fallback to
  raw/legacy is fine) from a present-but-non-finite value (NaN/Infinity -- a real data-integrity
  bug). `pickPageRankAuthorityScore()` now throws `PAGERANK_L1_CORRUPT_FAIL_CLOSED` on the
  CORRUPT case instead of silently substituting a different-source number with no caller-visible
  signal. Verified both callers (`feature-row-v1.ts` already throws its own error on `null`, so
  this composes cleanly; `canonical-hyperrag-adapter.ts` uses the non-throwing
  `resolvePageRankAuthority()` directly, unaffected). New test file
  `pagerank-authority.spec.ts` (7 tests), plus the 2 pre-existing `feature-row-v1.test.ts` tests
  still pass -- 9/9 green. One unrelated pre-existing failure found in the same directory
  (`pagerank-contract.test.ts` expects `PAGERANK_CONTRACT_VERSION` to be
  `atlas.pagerank.authority.v1`, actual value is `atlas.pagerank-authority.v1` -- different file,
  different constant, not touched by this change, not fixed here -- flagged for whoever owns
  that contract next).
- [x] **Item 3 (LLM judge seed + revision binding)**: `python/build_llm_judged_relevance_set.py`
  had a `SEED` constant already, but only for *which queries get sampled* (`random.Random(SEED)`),
  not for the actual `llama-server` judging call -- `temperature=0` alone is not sufficient
  replay identity on llama.cpp (seed is a distinct axis). Added `JUDGE_SEED`/`JUDGE_TEMPERATURE`
  constants, wired `"seed": JUDGE_SEED` into the `/v1/chat/completions` payload, and recorded
  `judge_model`/`judge_seed`/`judge_temperature` in every per-entry ndjson record and the final
  summary receipt, so a run's judgments are now traceable to the exact sampler config that
  produced them.
- [x] **Item 6 (degenerate zero-range feature detection)**: found the real min-max-style
  normalization in `python/benchmark_ga8_graph_feature_ablation.py::run_entry()` --
  `max_pr = max(...) or 1.0` -- which silently produces `pagerank_norm = 0` for every candidate
  in a pool where every pagerank value is 0 (or all tied), indistinguishable from a legitimately
  low-but-real signal. Added a `pagerank_degenerate` boolean per entry (zero max, or zero range
  across the pool) and a `degenerate_pagerank_entries` count in the run summary/receipt, so a
  reader can see how many entries contributed zero real discriminative power to the
  `semantic_plus_pagerank` average instead of that being silently invisible.

**Not done this round** (correcting the original review's framing, not just deferring):
- **Item 2** (graph provenance receipt SHA-256 verify) -- still not checked; needs a closer read
  of how `ga8-blend-weight-sweep-v1.json`/`-llm-judged-v1.json` are consumed downstream, if at
  all, before scoping a fix.
- **Items 4 and 5** (nDCG eligibility split, `metricRevision` constant like
  `NDCG_EXP2_GAIN_LOG2_DISCOUNT_V1`) -- **the critique's framing doesn't match live code**: this
  pipeline (`sweep_ga8_blend_weight.py`, `benchmark_ga8_graph_feature_ablation.py`,
  `sweep_llm_judged_relevance.py`) computes only `recallAt10`/`reciprocalRankAt10`
  (`eval_ranking()`); nDCG is not computed anywhere in this GA8 thread (confirmed via grep --
  the only nDCG code in the repo is an older, unrelated `scripts/atlas/benchmark-retrieval-ndcg10.mjs`
  that scores `community_confidence`, not this pipeline at all). Implementing an nDCG-specific
  eligibility rule and metric-revision tag here would be inventing a metric this pipeline doesn't
  use rather than hardening one it does. The underlying concern (tag the exact metric formula so
  future comparisons can verify they're apples-to-apples) is still valid for the real
  `recallAt10`/`reciprocalRankAt10` definitions here -- worth doing as its own follow-up, but
  distinct from what the critique specifically asked for.

Python syntax verified (`python -m py_compile`) on both edited files; no live run executed
(would hit real Postgres + llama-server, out of scope for a hardening-only pass).

### GA8-HARDEN-FINAL items 1/5/6 strengthened, item 2 implemented (2026-08-30, same session)

Between the previous entry and this one, a concurrent process/session had already picked up
items 1 and 6 and hardened them further than the first pass here, and implemented item 5's
underlying concern (a metric-definition tag, applied to the real recall/MRR metrics rather than
the nonexistent nDCG the critique assumed) -- via a new shared module `python/ga8_hardening.py`
consumed by both `benchmark_ga8_graph_feature_ablation.py` and `sweep_ga8_blend_weight.py`:

- **Item 1, strengthened**: `validate_pagerank_row()` now hard-fails (`SystemExit`) on NULL,
  non-numeric, non-finite, or negative `pagerank_l1` -- a real fail-closed gate, not the
  soft `CORRUPT` boolean flag the TypeScript side (`pagerank-authority.ts`) uses. The Python and
  TypeScript sides of this system independently converged on the same underlying goal
  (don't silently trust a broken pagerank_l1) via different call-site contracts appropriate to
  each language's caller (Python's sweep scripts abort the whole run on bad data since a partial
  sweep is meaningless; the TS side is invoked per-candidate inside a larger request and throws
  scoped to that candidate) -- this divergence is intentional, not drift, and both are correct
  for their own call site.
- **Item 6, strengthened**: `normalize_pagerank()` now does true min-max normalization
  (`(value - lo) / (hi - lo)`) with an explicit `degenerate: bool` return when `hi == lo`,
  replacing the max-scaling approximation from the first pass. Both scripts now report
  `pagerank_range` per entry and `degenerate_pagerank_entries` in the summary receipt.
- **Item 5, underlying concern addressed**: both scripts' receipts now carry
  `"metric_revision": "RECALL_AT_10_MRR_AT_10_BINARY_RELEVANT_POOL_V1"` and
  `"pagerank_normalization": "MINMAX_ZERO_ON_DEGENERATE_V1"` -- exactly the kind of explicit
  metric-identity tagging item 5 asked for, just applied to the metrics this pipeline actually
  computes instead of the nDCG variant that doesn't exist here.

- [x] **Item 2 (graph provenance receipt SHA-256 verify), implemented this turn**: added
  `verify_graph_provenance_receipt()` to `ga8_hardening.py`. Reads
  `sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json` (the real networkx-vs-cugraph
  parity proof that vouches for `atlas_graph_authority_scores.pagerank_l1` -- see CLAUDE.md's
  2026-08-26 correction: this parity pipeline, not Neo4j's own GDS PageRank run, is the trusted
  compute path GA8 reads from), computes a SHA-256 of the raw bytes, parses it, verifies required
  top-level fields (`status`, `graphRevision`, `pagerankCorrelation`, `manifest`) and required
  manifest fields (`nodeTableHash`, `edgeTableHash`, `graphRevision`) are present, and fails
  closed (`SystemExit`) on a missing file, unparseable JSON, missing fields, or a non-`PASS`
  status. Wired into both scripts' `main()` -- called once before any sweep work starts, result
  embedded as `graph_provenance` in both final receipts. Verified live against the real receipt
  (real SHA-256 computed, `status: PASS` confirmed) and against two synthetic failure cases
  (missing file, non-PASS status) -- both correctly raised `SystemExit` with a distinguishing
  error code. `python -m py_compile` clean on all three files.

**GA8-HARDEN-FINAL is now fully addressed**: items 1, 2, 3, 5, 6 implemented and verified;
item 4 (nDCG eligibility) remains not-applicable per the prior entry's finding (this pipeline
doesn't compute nDCG). No live sweep run executed in this session (would hit real Postgres +
Ollama/llama-server, out of scope for a hardening-only pass) -- next real run of either sweep
script will exercise the fail-closed paths for real for the first time.

### Item 3 (0.923 L1-sum orphan snapshot) investigated and resolved (2026-08-30, same session)

Picked up the third "Recommended before declaring _v2 canonical" item. First re-read the second/
third/fourth-pass patches above closely: item 1 (cross-check `_v2` vs oracle) was already done in
the third pass (found `_v2` unreliable at the ranking head despite near-1.0 aggregate correlation);
item 2 (re-run `stage5-pagerank-authority-validated.mjs`) is superseded by the fourth pass's
decision to promote the Aug-12 oracle NDJSON directly instead of rehabilitating `_v2`. Only item 3
was still genuinely open.

**Live investigation** (`atlas_graph_authority_scores`/`_runs`, columns are `run_id`/
`graph_snapshot_id`, not `id` -- checked schema via `\d` before querying):
- The 0.923 L1-sum snapshot is `graph_snapshot_id = 2693eab9-fe04-4367-9a72-e0f0f1b8416c`,
  `run_id = 86b29855-611a-4b33-b438-5fa982e169dd`, 2,902 rows, created 2026-07-22.
- **All three orphan snapshots share the same profile**: same day (2026-07-22), all three
  `run_id`s have zero matching rows in `atlas_graph_authority_runs` (`has_run_row = 0` for all),
  all are small dev-scale subsets (2,902 / 3,255 / 3,253 nodes) versus the real promoted graphs
  (40,754 and 162,234 nodes) -- consistent with abandoned early test/dev runs from before the
  current `PageRankPromotionGate`/run-row discipline existed, not partial writes of a real
  production run.
- **Only one of the three has the 0.923 bug** -- its two same-day siblings (`c309d750-...`,
  `8129be75-...`) both sum to `1.0000000000000457`/`1.0000000000000762` (correct, within float
  tolerance). This is a one-off computation defect in a single abandoned run, not a systemic bug
  in whatever code produced that batch -- there is no live normalization code to "fix" here, since
  none of the three were ever promoted or read by any consumer (confirmed: no run row means
  `PageRankPromotionGate.validateRun()` could never have validated any of them, and
  `feature-matrix.ts`'s live query only reads `status = 'promoted'` rows joined through a real
  run row, which these can never satisfy).

**Action taken**: backed up all 9,410 rows across the three orphan snapshots to
`deeds_labs/archive/2026-08-30/orphan_pagerank_snapshots_20260722_backup.csv` (verified row count:
9,411 lines = 1 header + 9,410 data rows = 2,902+3,255+3,253, exact match). **Operator decision:
leave the rows in the live table** -- backup taken as documentation/precaution only, not followed
by a delete. Re-raise this as a real deletion candidate only if a future session needs to
(per this repo's archive-then-delete convention) rather than assuming today's backup implies
removal is still pending.

**Item 3 status: investigated, root-caused, and resolved** (not "fixed" in the sense of repairing
live normalization code -- there was none to fix; resolved in the sense of determining these are
dead, never-promoted, backed-up-not-deleted test artifacts, closing the open question).
Item 4 (explicit CANONICAL_OWNER classification decision across `_v2`, non-v2, and
`graph_node_metrics`) remains the one item from this list still requiring operator judgment,
unchanged from the fourth-pass patch's framing.

### Graph analysis to ACE evidence path — alignment gates (2026-10-13)

This addendum aligns graph analysis with the existing retrieval, identity, ACE/BitFrost,
and GPU owners. It does not create a second graph processor, feature registry, cache
authority, or canonical packet identity. Source search found the reusable typed graph
runtime in `python/atlas_compute/typed_graph_runtime.py` (NetworkX reference with optional
cuGraph execution for PageRank/SSSP, plus 20×20 SOM-neighborhood lookup), GPU retrieval
endpoints in `python/atlas_rapids_sidecar.py`, and graph/RAG staging requirements in
`parent-atlas-gpu-graph-vector-substrate` and `parent-atlas-ace-rlm-bitfrost-integration`.
Presence of these owners is not evidence of a connected user-query-to-ACE path.

- [x] **GA-ACE-ALIGN-01 — owner discovery:** locate the typed NetworkX/cuGraph runtime,
  the existing Graph Analysis contracts, the RAPIDS sidecar, and the owning GPU/ACE task
  ledgers. Keep packet identity under `PacketKeyResolutionV2`; graph ordinals, paths,
  symbols, centroids, and cache keys are not canonical identity.
- [ ] **GA-ACE-ALIGN-02 — bounded source ingestion:** define a replayable flow from an
  immutable user-query/source snapshot through bounded streaming, chunking, exact source
  references, UTF-8 byte spans, and checksum verification. Reuse the existing parser,
  `.okf` validation, and source-binding owners. Keep the reported legacy TOC replay blocked:
  its V1 generator crashes on a 590 MB report, while V2 excludes 103 sources over 16 MiB
  from navigation; those exclusions do not delete or repair the artifacts. Recheck these
  supplied status claims before treating them as a fresh run receipt.
- [ ] **GA-ACE-ALIGN-03 — typed feature/tuple alignment:** specify versioned input/output
  tuples and a deterministic feature-matrix column/row map carrying packet/chunk identity,
  source/workspace/graph/feature revisions, producer, dtype/shape, and checksums. Keep POS
  tags, labels, AST facts, taxonomy, and derived feature remapping as separately versioned
  observations; reject missing or conflicting identity rather than aligning by path,
  ordinal, or row order alone.
- [ ] **GA-ACE-ALIGN-04 — CPU graph oracle:** implement no new algorithm until the existing
  NetworkX runtime and task owner are checked for the requested operation. Bound nodes,
  edges, hops, fanout, and response size; preserve typed multiedges and deterministic
  ordering. Graph traversal and `.okf`/ontology tuples may add evidence only after their
  source and relation admission gates pass.
- [ ] **GA-ACE-ALIGN-05 — advisory clustering and geometry:** evaluate KMeans and the
  existing 20×20 SOM only on a frozen, identity-aligned feature matrix, with deterministic
  CPU references and held-out stability/utility metrics. Centroids, LRU recency, 4D
  manifold/topology coordinates, and latent representations remain advisory routing or
  residency hints; they cannot mint identity, source evidence, or additional semantic/RRF
  votes. Reuse the existing LOD/TileKey design rather than allocating dense topology tensors.
- [ ] **GA-ACE-ALIGN-06 — optional GPU parity:** compare a bounded frozen batch against the
  CPU oracle before cuVS/cuGraph/PyTorch tensor execution. Record input snapshot, ordinal
  map, shape, dtype, device, resource lease, output checksum, numerical tolerance, and
  parity receipt. CUDA SIMT/cuVS/cuGraph remain existing execution options; cuTile is a
  later challenger only after profiling and toolkit/driver capability checks. Do not start
  GPU work while the shared 8 GiB device is serving a conflicting model workload.
- [ ] **GA-ACE-ALIGN-07 — parser acceleration gate:** retain bounded streaming as the
  correctness baseline. SIMDJSON is a CPU JSON/JSONL parser, not a GPU or vector transform;
  consider it only after representative profiling proves parse time is a bottleneck and
  compare output/checksum parity. AVX2 (256-bit) and AVX-512 (512-bit) are CPU execution
  capabilities, not vector dimensions or required alignment for semantic_768. Do not add
  N-API/native dependencies without measured end-to-end benefit and fallback tests.
- [ ] **GA-ACE-ALIGN-08 — canonical retrieval and ACE packet:** resolve candidates through
  the existing canonical identity and source-byte owners, apply one semantic-lane vote,
  and build the existing ACE JSON/ContextManifest contract with routing ID, phase/gate,
  lane, evidence references, revisions, and checksum where those fields are owned by the
  schema. Require ContextManifest admission and independent readback before prefill. MCP
  calls remain allowlisted, bounded, read-only enrichment unless a separate mutation grant
  exists; proposal/DAG output cannot authorize edits.
- [ ] **GA-ACE-ALIGN-09 — BitFrost/Valkey residency:** use the existing revision/checksum-
  qualified BitFrost token/context cache owner; retain its utility-based admission/eviction
  policy rather than introducing a competing hard-coded LRU. Cache hits are performance
  evidence only and must be revalidated against query, source, graph, feature, model, and
  ContextManifest revisions. Do not write centroids or ACE packets until the existing
  owner, authorization, and readback gates are demonstrated.
- [ ] **GA-ACE-ALIGN-10 — metrics and promotion:** emit per-stage receipts for parse/chunk,
  source admission, tuple/matrix alignment, CPU/GPU graph analysis, retrieval, ACE assembly,
  cache lookup, and token/latency/resource measures. Distinguish exact counts from optional
  HLL estimates; HLL is telemetry only. Keep generated task/DAG artifacts proposal-only
  until fresh-source checks, focused validation, and independent evidence admission pass.

**Current status:** GA-ACE-ALIGN-01 is a bounded source inventory only. The remaining gates
are open; no new end-to-end user-query graph-to-ACE execution, GPU parity, MCP live proof,
centroid/cache write, or production admission is claimed. The legacy TOC replay status above
is reported from the supplied audit and has not been rerun in this update. No database,
Qdrant, Redis/Valkey, GPU, model, or source-file mutation is authorized by this addendum.

**Ownership pointers:** canonical identity and source lineage remain in
`parent-atlas-retrieval-lineage-dag-convergence`; ACE and BitFrost in
`parent-atlas-ace-rlm-bitfrost-integration` and `parent-atlas-ace-bitfrost-cache-correctness`;
GPU tile/LOD and RAPIDS execution in `parent-atlas-gpu-graph-vector-substrate`; document
acquisition and `.okf` admission in the existing documentation-governance and versioned-doc
changes. Cross-reference those owners rather than marking their gates complete here.

### Graph processor discovery and TOC replay status (2026-10-13)

Source search confirms the reusable graph-analysis owner remains the Python typed
NetworkX/cuGraph runtime; do not introduce a second graph processor. A separate
`scripts/atlas/streaming-graph-indexer.mjs` file is present as an untracked prototype, not
an admitted implementation or demonstrated production caller. Static review found that
its JSONL reader parses one line at a time, silently ignores malformed lines, falls back
to a synthetic graph when the input path is absent, and writes a report under `docs/` even
when its mode is described as dry-run. It builds a CPU CSR sample and prints a simulated
768-D batch/VRAM estimate; it does not perform canonical source admission, embedding,
PostgreSQL/Qdrant indexing, GPU tensor analysis, KMeans, ACE packet creation, or a
ContextManifest readback. Do not run it against user data or treat its `VERIFIED` status
label as proof until those behaviors and side effects are corrected and tested.

The supplied TOC audit update reports that V1 still crashes on the 590 MB report and V2
excludes 103 inputs larger than 16 MiB from navigation without modifying them. This is
reported evidence, not a fresh replay performed by this ledger update. Preserve both facts
as a replay blocker; do not mark the excluded artifacts processed, repaired, or deleted.

- [ ] **GA-ACE-ALIGN-11 — qualify the graph processor boundary:** map the existing Python
  graph runtime, streaming/indexing prototypes, real callers, and report-writing side
  effects. Replace silent parse loss with explicit bounded rejects and a deterministic
  receipt before any ingestion claim.
- [ ] **GA-ACE-ALIGN-12 — prove evidence-to-ACE vertical slice:** on one admitted,
  revision-qualified source, prove source bytes → bounded chunks/UTF-8 spans → typed
  graph/ontology tuples → identity-aligned feature matrix → bounded CPU graph analysis →
  canonical retrieval → ACE JSON/ContextManifest validation and independent readback.
  Keep graph IDs, centroids, KMeans labels, SOM/4D coordinates, and cache keys advisory;
  only canonical packet/source owners can establish identity.
- [ ] **GA-ACE-ALIGN-13 — stage accelerators and residency:** measure CPU streaming first;
  compare GPU SIMT/cuVS/cuGraph/PyTorch to a deterministic CPU oracle only under the
  existing resource lease. Consider SIMDJSON, AVX2/AVX-512, N-API, HLL, and cuTile only
  behind measured bottleneck, correctness-parity, fallback, and capability gates. Reuse
  existing LOD, BitFrost, and Valkey owners; no centroid, ACE-packet, or cache writes until
  identity, revision, authorization, and readback gates pass.

**Status clarification:** GA-ACE-ALIGN-01 remains owner discovery only. The newly found
Node streaming prototype is not proof that streaming, indexing, matrix/tensor alignment,
GPU processing, or ACE synthesis is wired. TOC V1/V2 status above comes from the supplied
audit and remains NOT independently rerun. No generated report was produced by this review;
no database, Qdrant, Redis/Valkey, GPU, model, or source-data writes occurred.

### Bounded Python graph owner/caller audit (2026-10-13)

- `python/atlas_graph_runtime/contracts.py` and `networkx_executor.py` own the stronger V2 CPU oracle surface: deterministic canonical ordinal input validation, graph-revision/input/output checksums, and derived-only execution receipts. `cugraph_executor.py` is a separate GPU PPR executor over the same typed candidate-ordinal contract; it is not an identity or persistence owner.
- `python/atlas_compute/typed_graph_runtime.py` is not an independent production graph service: the legacy `networkx_executor.run_pagerank()` delegates to it for V1 compatibility. `networkx_executor.run_pagerank_v2()` implements the receipt-bearing V2 path. Keep these API generations distinct during any consolidation; this review made no code changes.
- Bounded exact-call search found graph algorithm calls in Python tests and offline proof/audit scripts. The registered TypeScript `graph-ppr` helper points at these Python modules and declares `executionSurface: OFFLINE_EXECUTOR`; no request-runtime caller that dispatches to the Python graph executor was established by this search. Therefore graph executor wiring into the live user-query → ACE path remains `NOT_PROVEN`.
- Focused local CPU checks passed: `PYTHONPATH=python py -3.13 -m pytest -q python/tests/test_networkx_executor.py python/tests/test_typed_graph_runtime.py python/parent_atlas_ontology/test_networkx_snapshot_replay.py` — **28 passed**. These tests prove local helper/snapshot contracts only; they do not prove production caller wiring, cuGraph availability, live graph revision admission, or ACE readback. No live service or store was called.

### Live GPU graph capability probe (2026-10-13; GET-only)

- The deployed `services/atlas-gpu-8098/app.py` imports `install_graph_routes()` from the shared `python/atlas_rapids_graph_runtime.py` owner. Read-only `GET /v1/graph/capabilities` on `127.0.0.1:8098` returned `available=true`, backend `cugraph.pagerank`, backend version `26.08.00`, algorithm revision `atlas.cugraph-pagerank.v1`, max 64 seeds, max 512 result nodes, and 768 MiB minimum free GPU memory.
- Read-only `GET /v1/graph/resident` returned `resident=null`; no graph was loaded. `GET /health` timed out after four seconds. This establishes `COMPONENT_LIVE` for capability discovery only—not graph execution, graph/source revision admission, candidate identity resolution, MCP dispatch, or ACE integration.
- The V2 registry's `graph-ppr` entry is not wired to a generic executor in the searched SvelteKit compiler: no dispatch branch consumes `executor.kind`/`ownerRef`. Its `PYTHON_SCRIPT` owner `python/atlas_compute/cugraph_ppr.py` exposes a callable parity function but no CLI entrypoint. Keep that helper declaration non-executable until an existing transport is qualified or its registry metadata is corrected. No graph load or compute POST, GPU mutation, database/cache write, or MCP call was performed.

### MCP graph expansion transport alignment (2026-10-13; local/mock proof)

- Replaced the `graph:expand` stdio-MCP fabricated neighbor-count response with the existing bounded `tool_graph_expand_neighborhood` implementation through `executeGraphExpandMcpTool`. Both stdio MCP and ACP now route to this shared adapter; ACP returns `success=false` when the underlying handler fails.
- Aligned the advertised request contract to bounded `sourceRefs` (1–8), `maxHops` (1–2), and `limit` (1–100). Missing seeds and invalid inputs fail before graph calls. The generic MCP Redis result-cache wrapper is bypassed for this tool; the graph helper may still perform its existing optional Redis GET for advisory PageRank scores.
- Removed the obsolete `toolGraphExpand` implementation that queried packet rows but returned no graph neighborhood and reported a nonexistent emitted event. Graph expansion output remains advisory; this does not establish canonical packet/source identity, graph revision admission, live MCP execution, ACE ContextManifest admission/readback, or BitFrost eligibility.
- Focused validation: `npx vitest run src/lib/server/acp/acp-mcp-integration.graph-expand.spec.ts src/lib/server/ai/mcp-tool-dispatch.graph-expand.test.ts src/mcp/read-tool-bounds.spec.ts` — **45 passed**, including ACP failure-status propagation. Tests use mocked graph/Redis dependencies; no live MCP request or live store mutation was performed.
- Keep GA-ACE-ALIGN-12 open until a revision-qualified source candidate passes independent source-byte verification, canonical identity resolution, and ACE/ContextManifest readback. The cuGraph/Python transport remains a separate open gate.

### Live TRACE MCP graph read and hop-bound correction (2026-10-13)

- `GET http://127.0.0.1:8788/health` returned healthy, non-degraded status with MCP, PostgreSQL, and Redis marked healthy. `tools/list` over Streamable HTTP exposed `graph.expand_neighborhood` and its bounded schema.
- One read-only `tools/call` used `sourceRefs=["src/lib/server/ai/mcp-tool-dispatch.ts"]`, `maxHops=1`, and `limit=3`. It returned `maxHops=2`, zero graph nodes/edges/sourceRefs, and confidence `0.45`; this exposed that the legacy `depth` default of 2 overrode an explicit one-hop request, and that confidence can be nonzero with no graph hits. This is not graph-evidence or source-lineage proof.
- A subsequent bounded call returned HTTP 200 but no SSE data event while `/health` remained healthy. Cause is undetermined; do not infer a successful second graph result or restart the service as part of this audit.
- Added shared `resolveGraphExpandHops()` so explicit `maxHops` takes precedence over legacy `depth` in both the local MCP adapter and TRACE MCP handler. Also changed empty-edge results to report confidence `0`; seed presence alone and unrelated cached PageRank entries no longer increase confidence. Regression tests cover hop precedence and empty-result confidence. Focused tests pass **47/47**. The live process was not restarted, so the corrected runtime behavior is NOT_YET_VERIFIED.
- Source review found the TRACE handler returned a successful empty SvelteKit traversal before reaching its existing read-only Neo4j fallback. It now falls through to that bounded fallback when the first path has no edges; a zero-row fallback reports confidence `0`. The fallback branch has syntax validation but no dedicated mocked integration test, and the running service has not loaded this source change.
- No database, Redis/Valkey, Qdrant, ACE packet, or GPU writes were performed. Keep live graph admission, canonical identity, source-byte verification, ContextManifest construction/readback, and BitFrost cache eligibility open.

### NetworkX lookup and RTX Leiden wiring check (2026-10-13)

- NetworkX already owns deterministic, derived CPU graph operations and snapshot replay (`python/atlas_graph_runtime/networkx_executor.py`, `python/parent_atlas_ontology/networkx_snapshot.py`). These operate on caller-supplied frozen graph/ordinal inputs; they do not load or resolve a canonical graph by MCP `sourceRef`.
- The current `graph.expand_neighborhood` MCP path remains a bounded Neo4j/SvelteKit traversal. Its separate `graph.community_for_node` handler reads a Neo4j community annotation; it does not dispatch to NetworkX or the RAPIDS community service.
- GPU Leiden already exists as a bounded challenger at `python/atlas_rapids_community_sidecar.py` and `python/atlas_rapids_community.py`, with a TypeScript client at `sveltekit-frontend/src/lib/server/graph/rapids-community-client.ts`. Source search found no caller of `runRapidsCommunityV1()`, so the client is not evidence of an active MCP-to-RTX path. The service accepts an explicit undirected weighted projection and returns a derived partition; it must not receive an arbitrary MCP-supplied graph as canonical input.
- The community sidecar defaults to port `8099`, which the supplied live-service review identifies as the rerank service port (currently down). Resolve port ownership/configuration before any sidecar start; do not infer that the down reranker is the community service.
- Safe next implementation gate: reuse the existing canonical graph-projection/ordinal manifest owner to resolve a bounded sourceRef query to one revision-qualified frozen projection; then expose a read-only NetworkX lookup through the existing graph MCP contract. Keep Leiden an explicitly requested, bounded challenger over an already admitted undirected projection, with snapshot checksums and CPU/GPU comparison receipts. Do not start a new service, load the live graph, invoke GPU compute, persist partitions, or admit cluster labels as identity/evidence in this gate.
- Current focused MCP bridge validation passes **48/48**. This proves mocked local dispatch/bounds only—not a NetworkX MCP lookup, live Leiden execution, RTX availability, graph/source admission, or ACE readback. No graph, database, cache, Qdrant, or GPU mutation occurred.
- Follow-up safety fix: `rapids-community-client.ts` now resolves its URL through `ENV.ATLAS_RAPIDS_COMMUNITY_URL` (or an explicit test/caller override) and rejects missing configuration before fetch; the implicit `127.0.0.1:8099` fallback was removed. Regression tests prove no request occurs without configuration and an explicit URL is honored. Combined MCP/client tests pass **50/50**. This removes accidental port guessing; it does not add an MCP caller or prove service reachability.
- Snapshot-source recheck: `docs/reports/graphify-downstream-chain-2026-10-13.json` is a dry-run whose readiness stage timed out (60 polls; 193,324 ms), despite the wrapper summary's `success: true`. The last `CURRENT_SNAPSHOT_PROVEN` authority report is dated 2026-09-23; the structural graph artifact is dated 2026-08-31; the NetworkX export is dated 2026-09-03. The latest structural projection diagnostic is blocked on workspace binding and has `graphRevision: null`. These artifacts do not qualify as a current graph lookup input. Do not wire them into MCP or run GPU analysis until a current, revision-bound projection and ordinal map are produced and independently read back.
- Corrected the downstream pipeline's report contract: dry-run stage failures/timeouts/errors now make `summary.success` false and set a nonzero process exit; skipped optional stages remain neutral. Added pure regression tests. This corrects receipt truth only; it does not refresh Graphify or qualify any graph snapshot.
- MCP graph expansion previously synthesized `IMPORTS` edges from seed/neighbor pairs even though its Neo4j owner returned only neighbor keys. It now requests bounded Neo4j paths and returns their actual relationship types and hop positions; heuristic confidence is fixed at zero. The focused MCP/ACP dispatch suite passes **5/5**, and the path adapter tests pass **2/2** with a mocked Neo4j driver. This makes the traversal payload more truthful, but still does not provide a current revision-bound MCP graph lookup, canonical packet admission, or RTX Leiden execution. No live Neo4j, NetworkX service, RAPIDS, GPU, database, or cache calls were made.
- Rechecked the local frozen projection instead of assuming no NetworkX lookup artifact exists. The October 9 `graph-projection-oracle-v1` manifest and Parquet files pass `validate_graph_projection_artifact_v1`; they declare 23 nodes, 12 edges, graph revision `sha256:da965b...`, `canonicalAuthority=false`, and mode `NON_PRODUCTION_DERIVED_ARTIFACT`. A CPU-only NetworkX read resolved the packet node for `crates/atlas_packet_parser/wrapper.js` to two `DEFINES` occurrence neighbors. The existing October 9 CPU receipt also records BFS source ordinal 16 and bounded results. This proves offline NetworkX lookup on that frozen fixture only; its workspace revision predates the current uncommitted source edits, so it is not a current MCP input. No runtime/store/GPU operation was performed.
- Rechecked `docs/reports/current-structural-graph-cpu-gpu-parity-v1.json`: it is dated August 31 and proves `networkx`/`cugraph.pagerank` parity for graph revision `sha256:e0807b...`, not Leiden. That graph revision differs from the October 9 CPU fixture (`sha256:da965b...`), so the old parity receipt cannot qualify the fixture's GPU execution. RTX/cuGraph Leiden remains NOT_VERIFIED; no GPU job was started.
- Hardened the existing RAPIDS community challenger boundary: TypeScript and Pydantic cap explicit projections at 200,000 nodes / 1,000,000 edges; the client rejects duplicate/invalid node IDs, dangling/self edges, nonpositive/nonfinite weights, and empty revision labels before HTTP dispatch. It also rejects a response whose graph/topology/projection revisions, algorithm ID, or exact assignment/community membership disagree with the request. The TypeScript client tests pass **5/5**, Python files pass `py_compile`, and direct Pydantic 2.13.4 checks reject node and edge over-limit payloads. Python pytest is unavailable in both configured interpreters. These guards make the challenger safer to call but do not provide a qualified graph snapshot or authorize MCP/RTX execution. No service/GPU/store call occurred.
- Current-source recheck: the admitted workspace tournament receipt is dated 2026-09-15, names `graphifyExecutionAuthorized=false`, and its snapshot manifest has `workspaceRevision=null`; the authority report is dated 2026-09-21. They cannot qualify an October current graph input. Hardened `audit-current-graphify-snapshot-authority-v1.mts` for any future authorized refresh: removed its embedded database-URL fallback, added an enforced PostgreSQL `BEGIN READ ONLY` transaction with rollback, and added an optional report directory restricted to `.tmp/atlas`. No database query or report refresh was run because the source snapshot admission is stale and does not authorize Graphify execution. Live MCP/NetworkX/RTX Leiden remains blocked on a fresh source admission, projection, and independent readback.
- MCP/NetworkX/RTX integration boundary recheck (2026-10-13): `graph:expand` is a live MCP/ACP adapter for bounded Neo4j path traversal, not a lookup over the local NetworkX snapshot. The October 9 NetworkX projection is an offline `NON_PRODUCTION_DERIVED_ARTIFACT` with `canonicalAuthority=false`; no current canonical projection resolver is exposed by MCP. The 8098 resident graph API currently registers capabilities, resident status, load, PageRank, BFS, connected-components, and Jaccard routes; it does not register Leiden. The separate `runRapidsCommunityV1()` client has no in-repository caller and accepts an explicit projection, so it cannot safely be wired as an MCP tool using caller-supplied nodes/edges or the stale fixture. Keep the requested sourceRef→NetworkX lookup and optional RTX Leiden MCP tool open until an existing canonical graph-projection/ordinal owner can resolve one current, checksum-bound undirected snapshot and return it with independent readback. Then compare NetworkX and cuGraph Leiden on that exact snapshot; partition labels remain advisory and cannot create identity, source evidence, or another retrieval vote. No live graph load, GPU execution, MCP graph call, or store mutation occurred.
- Existing resident runtime detail (2026-10-13): `GraphRuntimeManager` retains the checksum-bound projection, graph-node-key↔GPU-ordinal maps, and edge table after an explicitly requested load. Its `/v1/graph/bfs` handler requires the resident graph revision and returns graph/projection/artifact/ordinal checksums with `writesPerformed=false` and `canonicalAuthority=false`; the TypeScript client currently exposes only resident status, load, and PageRank. `loadProjection()` changes GPU residency and must not be hidden inside a lookup MCP call. A future safe read tool can target an already resident graph with explicit expected revisions, while NetworkX remains the CPU oracle over the exact same frozen node/edge artifact and Leiden is a separately requested GPU analysis—not a graph lookup or retrieval vote. No code/runtime route was added because current source admission and resident graph identity are not proven for the active workspace.
- Resident graph lookup bridge implementation (2026-10-13; local/mock proof): Added `graph:resident_bfs` MCP schema/dispatch and a TypeScript client call to the existing 8098 `/v1/graph/bfs` endpoint. It requires graph/projection revisions, projection/artifact/ordinal checksums, explicit node key and depth 0–2; it never calls `loadProjection()`, bypasses generic MCP result caching, and rejects mismatched response identity or any response claiming writes/canonical authority. The isolated MCP dispatcher test passes **1/1** and the RAPIDS client suite passes **6/6**. The combined suite passed once at **11/11**, then intermittently timed out in the pre-existing Neo4j expansion test; the new resident test and client tests passed in isolation. This is a source-level, mocked adapter—not proof of live 8098 reachability, current source admission, NetworkX execution, or Leiden. NetworkX CPU lookup/parity and resident-snapshot Leiden remain open; no live service/GPU/store call occurred.
- Endpoint owner correction (2026-10-13; source recheck): The 8098 graph routes are registered indirectly: `services/atlas-gpu-8098/app.py` calls `install_graph_routes(app)`, which registers `/v1/graph/capabilities`, `/resident`, `/load`, `/pagerank`, `/bfs`, `/connected-components`, and `/jaccard` in `python/atlas_rapids_graph_runtime.py`. The previous note claiming `/v1/graph/bfs` was absent was incorrect and is superseded by this correction. `BFSRequest`, the TypeScript client payload, and receipt identity fields align at source level; the graph tests exercise runtime logic, but live 8098 reachability and a current admitted resident projection remain unverified. The sourceRef lookup gap remains: projection artifacts have optional `source_ref`/`source_revision`, while `GraphOrdinalMapV1` carries only graph keys. One sourceRef may map to multiple graph nodes (for example, packet and symbol nodes); preserve the full bounded, revision-matched result set rather than selecting one arbitrary node. No live operation occurred in this source recheck.
- Read-only runtime recheck (2026-10-13): `GET http://127.0.0.1:8098/v1/graph/capabilities` returned `available=true`, cuGraph `26.08.00`; `/v1/graph/resident` returned `resident=null`. This confirms the graph service and cuGraph import are live but no projection is resident, so no BFS/Leiden operation was attempted. `:8099/health`, `/v1/capabilities`, and `/openapi.json` all refused connections; the RAPIDS community/Leiden sidecar is not live at that address. These checks prove service health/configuration only, not a live graph lookup, NetworkX execution, or Leiden result. No graph was loaded and no GPU computation or store/cache mutation occurred.
- SourceRef seed-resolution owner review (2026-10-13): `traverseGraphV1()` is an existing bounded PostgreSQL graph traversal over a `VALIDATED` `atlas_graph_snapshots_v2` snapshot; it accepts only `seedNodeKeys` and returns each node's `packetKey`/`sourceRef`. It does not accept sourceRef seeds or return graph ordinals/artifact checksums, so it is a useful canonical traversal owner but not yet a NetworkX-compatible MCP lookup bridge. The next implementation must resolve exact sourceRef seeds within the caller-selected validated snapshot, reject ambiguous or revision-inconsistent matches, then pass the same frozen graph/ordinal artifact to the existing NetworkX oracle. RTX Leiden remains a separate optional operation on that exact projection. No DB, service, GPU, or cache operation occurred.
- GraphRAG table census recheck (2026-10-13; report-only): `docs/reports/graphrag-multihop-analysis-2026-10-13.json` inventories 32 populated graph/edge tables and lists existing owners for TRACE graph expansion, cuGraph PageRank, a NetworkX parity oracle, and Top-K pagination. It explicitly records that no bounded multi-hop traversal has run, NetworkX PageRank is unrun, and endpoint identity (`packet_key` vs `source_ref` vs node key) is unverified per table. Its owner note that TRACE expansion hung is report-derived and was not independently retried here. Do not select `atlas_graph_edges_v2`, `ontology_edges`, or other populated tables by row count alone. Next gate: inspect the existing canonical packet/node resolution and exact endpoint columns for one chosen table, then prove one bounded lookup against a frozen revision before MCP exposes it. The report is inventory evidence, not a current-source or graph-admission receipt.
- Graph snapshot traversal safety guard (2026-10-13): `traverseGraphV1()` now rejects missing or non-`VALIDATED` snapshots before traversal and repeats the validated-status predicate in the recursive edge walk, node selection, and edge result query to reduce status-change races. Regression tests cover missing, `BUILDING`, and `SUPERSEDED` rejection before graph queries, plus validated-snapshot query predicates. The updated traversal suite passes **4/4**; MCP expansion and RAPIDS client suites passed **11/11** in the immediately preceding run (the combined suite was not rerun after adding the two negative controls). This is local mocked proof that the existing PostgreSQL traversal is status-gated; it does not establish current-source lineage, snapshot freshness, live database behavior, NetworkX MCP lookup, or RTX Leiden availability. No live database, graph service, GPU, cache, or model operation occurred.
- CPU NetworkX executor revalidation (2026-10-13): current-checkout offline executor, snapshot-replay, and oracle algorithm suites pass **22/22** with Python 3.13. This revalidates deterministic fixture/snapshot operations only; it does not wire sourceRef lookup into MCP, qualify the underlying graph as current, compare against live PostgreSQL/Neo4j, or prove nx-cugraph/RAPIDS Leiden availability. No GPU or service was started.
- CSR traversal cursor correctness (2026-10-13): fixed `traverseCsrWithCursor()` so pagination resumes a deterministic BFS prefix instead of restarting and repeating/skipping results. The cursor now binds graph revision, seed digest, graph/request edge-policy revision, maximum depth, offset, last result and a discovery-prefix checksum; malformed CSR arrays, invalid seeds and tampered/stale cursor state fail closed. Traversal retains only the CSR, visited bitset/frontier, one result page and a one-node lookahead, at the cost of recomputing the prefix on resumed pages. Regression tests pass **6/6** and focused strict TypeScript compilation passes. ESLint could not load because `typescript-eslint` is missing; Prettier still flags formatting in the two new files. This proves the local CSR helper contract only, not current graph provenance, MCP wiring, sourceRef lookup, or live NetworkX/cuGraph/Leiden execution.
- SourceRef-to-ordinal resolver primitive (2026-10-13): added `resolve_graph_source_ref_v1()` to the existing Python graph-projection manifest owner. It first validates the complete graph artifact and ordinal checksum, then matches exact sourceRef plus caller-supplied source/workspace revisions, returning all matching ordinals in deterministic order and rejecting missing, stale, revision-incomplete, or over-limit results. Its targeted unittest passes **1/1**. This is fixture-only resolver coverage: the default Windows Python lacks NetworkX and pytest, no current qualified projection is resident, and no MCP or RTX Leiden route consumes the helper yet. No package installation, graph load, or live store/cache write occurred.
- Resident lookup gate correction (2026-10-13): do not wire `resolve_graph_source_ref_v1()` directly to the 8098 resident graph yet. `ResidentGraph` reads node identity fields `gpu_node_id`, `graph_node_key`, and `packet_key`, so it drops `source_ref`, `source_revision`, and per-node `workspace_revision`; the GPU edge read also omits `edge_type`. Its load path verifies counts, dense/unique ordinals, endpoint bounds, and the ordinal-map checksum, but does not recompute the full node/edge table checksums required by the sourceRef resolver. A route over those fields would therefore overstate integrity and lineage. Keep lookup unexposed until the existing artifact loader can verify complete table content and retain bounded exact source metadata, or an already-qualified canonical snapshot owner supplies that proof. This review made no `atlas_rapids_graph_runtime.py` changes, started no service/GPU work, and performed no store/cache writes.
- Producer-contract follow-up (2026-10-13): the resident 8098 loader consumes `GRAPH_SNAPSHOT_PARITY`, whose TypeScript exporter currently defines `GraphSnapshotParityNodeInput` without source/workspace revision and materializes `source_revision: null`; its manifest contract is also distinct from `atlas.graph-projection-artifact.v1` consumed by `resolve_graph_source_ref_v1()`. Therefore, merely teaching the GPU loader to retain optional columns cannot produce revision-qualified lookups. The next owner-level gate is to trace the existing canonical source-revision receipt into `graph-snapshot-materializer.ts`/the parity exporter, add only an evidence-backed revision-bearing projection contract, and then unify or explicitly adapt checksum validation across these artifact formats. Until that producer path proves source/workspace revisions and table-content checksums, NetworkX sourceRef lookup, MCP exposure, and RTX Leiden over a current admitted graph remain unproven. No producer or runtime changes were made in this review.
- Revision provenance propagation (2026-10-13; source-level/test proof): the existing canonical Postgres graph-snapshot loader already joins `atlas_packets.source_revision` to `graphify_execution_file_membership_v2.code_source_revision` within the caller-supplied workspace revision, but previously omitted `p.source_revision` from its selected packet shape. It now selects and preserves that exact value, passes the explicit workspace revision into the graph snapshot manifest, includes revisions in packet nodes and tree nodes only when the exact packet key or a single consistent exact sourceRef resolves them, incorporates them into the source-inventory hash, and carries optional source/workspace revisions through parity export into node parquet rows and its manifest. Conflicting/missing revisions remain null; no revision is inferred. Postgres materializer and parity-exporter tests pass **7/7**. This corrects the earlier claim that the Postgres graph input had no source-revision owner; it does not yet revise old frozen JSON artifacts, prove that the export is currently generated from this materializer, reconcile the two artifact checksum/ordinal contracts, or wire sourceRef lookup to NetworkX/MCP/RTX Leiden. Full `npm run check` was stopped at ~1.1 GB working set due the previous multi-GB checker abort; no database, GPU, MCP, or cache operation occurred.
- Follow-up on the actual full-corpus snapshot writer (2026-10-13; source-level/focused-test proof): `materialize-full-corpus-graph-snapshot-v3.mts` builds its own materializer input rather than using the Postgres loader, and omitted the already-qualified workspace revision. It now binds tree and packet rows against the authoritative workspace source manifest before materialization, passes the workspace revision into the materializer, and therefore includes source/workspace revisions in serialized node properties and the materializer's source inventory hash. The post-materialization binding remains an independent coverage gate; conflicting tree/packet source revisions fail closed. Graph source-binding, materializer, Postgres loader, and parity-exporter tests pass **22/22**. Syntax checks and a direct static check of the writer handoff pass. No live APPLY, database, Neo4j, Python, NetworkX, RAPIDS, GPU, or cache operation occurred. This is not yet evidence that a frozen export was regenerated or admitted; NetworkX/RTX Leiden MCP routing and artifact checksum/ordinal unification remain open.
- NetworkX sourceRef lookup composition (2026-10-13; focused WSL test proof): added `lookup_networkx_source_ref_v1()` to compose the checksum/revision-validating sourceRef resolver with the existing bounded CPU BFS executor. It preserves all exact sourceRef matches, per-node source/workspace revisions, graph/ordinal checksums, and execution receipts; max depth is capped at 4 and result matches at 16. Package export and a multihop regression test were added. The configured WSL RAPIDS Python reports NetworkX 3.6.1; the complete focused oracle suite passes **10/10**. Python compilation, strict OpenSpec validation, and `git diff --check` pass. This helper is not wired to MCP and operates only on caller-supplied frozen artifacts; current graph admission, live lookup, RTX Leiden, and source-byte verification remain open. No database, service, cache, or GPU operation occurred.
- Leiden backend correction (2026-10-13; WSL import/API probe): NetworkX 3.6.1 exposes `community.leiden_communities` as a dispatch API, not a native CPU implementation; a tiny CPU-default call returns `NotImplementedError`. The configured environment does have `nx-cugraph` registered as a NetworkX backend and cuGraph 26.06.00 with callable `cugraph.leiden`, but neither `igraph` nor `leidenalg` is installed for a standalone CPU Leiden reference. This establishes backend/API availability, not RTX/device visibility, GPU kernel execution, or parity on the same admitted graph. No Leiden GPU operation or MCP/sidecar routing was run. Run a CPU Leiden reference via an explicitly verified standalone CPU backend (or use deterministic non-Leiden CPU partition reference) before parity claims.
- Resident projection content verification (2026-10-13; local regression proof): the 8098 resident graph loader now recomputes the exporter’s sorted-row SHA-256 hashes for the complete node and edge parquet tables before backend graph initialization, fails closed on either table mismatch, and retains optional exact sourceRef/source/workspace revisions alongside node keys in host-memory identity mappings. Added TypeScript-compatible hash goldens and a fake-backend regression proving tampered node-table content is rejected before cuGraph initialization; both pass **2/2** when invoked in the configured WSL RAPIDS Python. Python compilation and `git diff --check` pass. Pytest is absent in that environment, so the full pytest module was not run. This does not prove a graph is resident/current, add source-byte verification, wire MCP, or execute GPU/Leiden; no GPU, database, or cache operation occurred.
- Resident sourceRef-to-BFS route (2026-10-13; local regression/mock proof): added `/v1/graph/source-ref-bfs` to the already-resident 8098 graph manager and `graph:resident_source_ref_bfs` to MCP. The request pins graph/projection/artifact/ordinal checksums plus exact sourceRef, source revision, workspace revision, and depth 0–2; the route never loads a graph, rejects missing/stale/mismatched source metadata and over-limit ambiguity, retains all exact matches, and attaches available source revision fields to traversal neighbors. MCP bypasses generic result caching and validates the bounded response. Direct WSL regressions pass **3/3**; RAPIDS client and MCP dispatch tests pass **14/14**; Python compilation, strict OpenSpec validation, and targeted `git diff --check` pass. These are local/mocked proofs only: no resident graph was queried, no GPU/Leiden operation ran, and current-source byte admission remains open. No database, service, or cache writes occurred.
- Bounded MCP Leiden advisory (2026-10-13; local/mock regression): exposed the existing RAPIDS community client as `graph:community_leiden`, limited to caller-supplied projections of at most 512 nodes and 4,096 edges. It bypasses generic caching and labels output `DIAGNOSTIC_ONLY`, noncanonical, non-promoted, and non-writing. This does not fetch a NetworkX snapshot, verify the caller's topology hash against authoritative graph bytes, prove RTX execution, or enable production community lookup; those gates remain open.
- Current artifact resolver recheck (2026-10-13; read-only WSL validation): `.tmp/atlas/graph-projection-oracle-v1` passes `validate_graph_projection_artifact_v1` against its local Parquet contents (23 nodes, 12 edges; 23/23 rows carry `source_ref` and `source_revision`); manifest declares `canonicalAuthority=false`, `NON_PRODUCTION_DERIVED_ARTIFACT`, workspace revision `sha256:b19b04b6…`, and producer `build-current-structural-graph-artifact-v1`. `docs/reports/current-structural-graph-artifact-v2` is dated August 31, 2026 and also declares `canonicalAuthority=false`. These validate artifact integrity only; neither is independently current-source admitted for today’s edited workspace, and neither was sent to MCP or Leiden. The exact NetworkX→MCP→RTX snapshot bridge remains blocked on an existing current-revision projection owner/readback. No store, service, cache, or GPU operation occurred.
- Resident BFS fixture-proof correction (2026-10-13): `python/tests/test_resident_bfs_proof.py` constructs an in-memory NetworkX graph and monkeypatches `cugraph` with `FakeCuGraph`; the reported 5/5 pytest result is fixture/unit coverage, not live BFS, MCP transport, or GPU execution. Its source-text assertion does not invoke MCP, and the receipt test does not exercise GraphRAG or ContextManifestV2. Corrected `docs/reports/atlas-resident-bfs-proof-2026-10-13.json` to `FIXTURE_ONLY`, explicitly marks live service/GPU execution false and GraphRAG/context admission `NOT_EXERCISED`, and discloses the local receipt write. The implementation endpoint may call real `cugraph.bfs` when invoked, but live proof still requires an already-resident, current, checksum-qualified graph and a real bounded service request with independent response readback. Do not interpret this fixture test as live evidence.
- Live graph-service status read (2026-10-13): read-only GETs to `127.0.0.1:8098/health`, `/v1/graph/capabilities`, and `/v1/graph/resident` returned service healthy, CUDA available on NVIDIA GeForce RTX 3060 Ti, PyTorch unavailable, cuGraph capability `26.08.00` reported for PageRank, and `resident: null`. This is live health/capability evidence only. No BFS request was sent because there is no resident graph; no GPU BFS execution or live MCP call is claimed.
- Python ML runtime inventory (2026-10-13): direct interpreter probes found Windows repo `.venv` PyTorch `2.13.0+cpu` and XGBoost `3.2.0` with `USE_CUDA=true`/CUDA `12.9`; configured WSL RAPIDS Python has PyTorch `2.13.0+cu130` with CUDA available and XGBoost `3.3.0` with `USE_CUDA=true`/CUDA `13.3`. These are package/build facts, not workload or production-service proof. Details and limitations: `docs/reports/python-ml-runtime-inventory-2026-10-13.md`.

## Live Graph Search and Analysis Workboard (2026-10-13)

This is the dependency-ordered implementation checklist for the resident graph, AST/KAG traversal, GPU analysis, and retrieval boundaries. It applies the GAN status model: `CREATED` means an owner/artifact exists, `WIRED` means a demonstrated producer-to-consumer call exists, `PROVEN` requires current live evidence and independent readback, and `DONE` requires wired + proven + accepted. Fixture/unit tests are useful contract coverage but never satisfy a live gate. Do not mark these items complete from source presence, mocked tests, stale Graphify, health endpoints, a self-authored receipt, or generated TOC counts.

### P0 — Evidence and identity foundations

- [ ] **LIVE-GRAPH-00 — Keep evidence classes honest.** Preserve the fixture receipt as `FIXTURE_ONLY`; ensure test names, summaries, and generated receipts say when `FakeCuGraph`, synthetic nodes, monkeypatches, or source-text assertions are used. Add a regression that fails if fixture output claims live service, GPU, MCP, GraphRAG, or ContextManifest success. Record local report writes separately from canonical-store writes.
- [ ] **LIVE-GRAPH-01 — Establish one current graph seed.** Reconcile the existing graph snapshot, AST/source-binding, packet/chunk, and ordinal-map owners. Require one immutable snapshot ID, graph/projection/workspace/source revisions, producer/run identity, full node/edge artifact checksums, deterministic ordinal-map checksum, canonical node keys, and typed edge semantics. Reject stale, synthetic, ambiguous, path-only, or unbound artifacts; do not rebuild Graphify as part of this audit.
- [ ] **LIVE-GRAPH-02 — Qualify source-backed incidence.** For the selected bounded seed, verify node and edge identities against exact packet/chunk bindings and current source revisions. Where AST spans are involved, validate byte-offset convention, workspace root, UTF-8 byte boundaries, whole-file digest, and extracted-span digest. Structural similarity or semantic similarity is not an edge or source proof.
- [ ] **LIVE-GRAPH-03 — Capture live executor readiness.** Record separate read-only service health, CUDA/device, backend/API capability, and resident status. Current observation is `COMPONENT_LIVE` for 8098 health/capability, but `resident=null`; PyTorch is unavailable and the advertised cuGraph capability is PageRank. No BFS, resident graph, PyTorch, or MCP execution is thereby proven. Stop before graph load or GPU allocation unless a separately authorized resource window and idle check exist.
- [ ] **LIVE-GRAPH-04 — Publish an evidence receipt contract.** Bind each proof to request ID, caller/tool, exact input artifact and checksums, canonical seed, graph/projection/workspace/source revisions, algorithm/parameters, service/backend/device versions, start/end times, response checksum, and explicit attempted/committed write counts by store. A receipt emitted only by the code under test is not independent readback.

### P1 — Traversal and MCP vertical slice

- [ ] **LIVE-GRAPH-05 — Define graph-search semantics.** Document BFS as unweighted minimum-hop traversal; define edge direction, allowed edge types, depth and result limits, deterministic tie ordering, and cycle behavior. Define A* only for a weighted path objective with an admissible/consistent heuristic and independently tested optimality. “S-graph search” is not assumed to be a standard algorithm: identify its existing owner and formal semantics or leave it out of the API.
- [ ] **LIVE-GRAPH-06 — Establish the CPU oracle.** Run bounded NetworkX BFS (and A* only if a qualified weight/heuristic contract exists) over the exact admitted immutable node/edge artifact—not a hand-built graph. Record reachable canonical IDs and hop/cost results, plus a deterministic oracle receipt. Unit fixtures remain a separate test tier.

### Graph search and Tree-sitter alignment audit (2026-10-13)

This source/test audit identifies existing implementations, not an admitted live graph or completed integration.

- `python/atlas_compute/graph_search_subhelpers_v1.py` already contains bounded BFS, weighted A* (Dijkstra when heuristic is omitted), greedy best-first, and Louvain helpers. Its inputs are plain adjacency mappings; these helpers do not bind graph/source/workspace revisions or emit the receipt contract used by `atlas_graph_runtime.networkx_executor.py`.
- `python/atlas_graph_runtime/networkx_executor.py` owns the receipt-bearing, revision/checksum-bound NetworkX executor and deterministic BFS; its input contract rejects parallel edges. It has SSSP but no A* executor. Keep this as the execution/receipt owner; do not add a third graph-search implementation.
- The existing A* helper validates heuristic values as finite/nonnegative, but does not prove admissibility or consistency. Its expansion-budget exhaustion returns an empty path like an unreachable goal, so those outcomes are not distinguishable in its current return contract. A* cannot be promoted until cost/tie semantics, goal/unreachable/budget statuses, and a graph-bound receipt are defined and tested.
- No code owner or contract for “S-graph search” was found in the bounded source search. Keep it out of API names and claims until its intended algorithm and evidence owner are identified.
- The Python sidecar's `AstChunkRequest` requires source text, language, file path, and source revision, but carries no workspace revision or packet identity. `AnalyzeRequest` makes source/workspace identity optional; `_build_ast_units` falls back to `unknown`. The chunker adapter can derive offsets from line spans when byte spans are absent and strips/truncates emitted text, so chunk payload text is not by itself proof that `source_bytes[start_byte:end_byte]` matches the chunk.
- Before AST/chunker observations enter a graph seed, require exact source/workspace revisions, parser/chunker revisions, source-byte-span validation, stable node/edge identity, and explicit unresolved-edge status. Tree-sitter/ast-grep/LangExtract outputs remain separately typed evidence; only qualified relations become graph edges.
- Cython is not an existing requirement for these paths. PyTorch in `miniforge_nlp_sidecar.py` is optional and currently computes a small text-statistics tensor; no graph-learning/autograd owner is wired here. Do not add Cython or GPU/PyTorch to BFS/A* unless profiling or a separately accepted learning experiment justifies it.

Focused local validation: `py -3.13 -m pytest -q python/tests/test_graph_search_subhelpers_v1.py python/tests/test_nary_networkx_alignment_v1.py python/tests/test_networkx_executor.py python/tests/test_networkx_oracle_algorithms_unittest.py` — **27 passed**. This is fixture/helper proof only; LIVE-GRAPH-01/02/05/06, source-byte admission, live MCP/8098 execution, and GPU parity remain open. No graph was created from live data, and no database, MCP, cache, or GPU operations were run.
- [ ] **LIVE-GRAPH-07 — Prove resident cuGraph execution.** Only after LIVE-GRAPH-01–04 pass and the graph is already resident under an approved GPU window, call the real 8098 BFS route with the exact expected graph/projection/artifact/ordinal checksums. Capture service logs/telemetry proving the real cuGraph call, device execution, bounded request/response, and no implicit graph load. Compare every returned node identity and distance/cost against the CPU oracle. Missing residency is `BLOCKED`, not a reason to load inside the MCP lookup.
- [ ] **LIVE-GRAPH-08 — Prove MCP transport wiring.** Invoke the registered MCP tool through the actual JSON-RPC transport against the live service. Verify schema validation, canonical wire aliases, timeouts, cancellation, bounded results, error propagation, response identity/checksum validation, and that no generic cache or fallback substitutes fixture data. Preserve separate `MCP_COMPONENT_LIVE` and `MCP_VERTICAL_PROVEN` statuses.
- [ ] **LIVE-GRAPH-09 — Independent result readback.** Independently re-read the exact source identities/revisions for returned nodes and edges through existing canonical owners. Reject missing or superseded lineage. Only then label the bounded traversal `LIVE_PROVEN`; graph traversal still cannot itself grant ACE admission or canonical authority.

### P1 — AST/KAG, ontology, and ACE evidence

- [ ] **LIVE-GRAPH-10 — Bind AST/KAG evidence.** Reuse 8095 Tree-sitter/AST-grep and existing packet/chunk/source-binding owners. Preserve native symbol/node IDs, exact byte spans, typed relation IDs, source/workspace revisions, and checksums. Do not create a parallel graph identity or infer incidence from matching filenames.
- [ ] **LIVE-GRAPH-11 — Type ontology tuples and labels.** Reuse the validated `.okf` vocabulary/schema and existing ontology tuple owners. Treat NLP/domain labels as versioned proposals carrying evidence spans and source refs; reject unknown terms/schema revisions and do not promote labels into identity or graph edges without an existing admission owner.
- [ ] **LIVE-GRAPH-12 — Admit evidence through ACE owners.** After canonical resolution, use the existing candidate filtering/scoring, ACE packet builder, ContextManifest, and validation/readback owners. Verify sourceRef, canonical ID, concept ID where applicable, confidence basis, context checksum, and token budget. Never pass raw graph/MCP hits directly to the LLM. Cache/BitFrost warm reuse is a later gate and must match a cold reconstruction by revision and checksum.
- [ ] **LIVE-GRAPH-13 — Test vertical lineage.** Add an end-to-end test using a live or explicitly designated test service and a frozen qualified seed. It must assert producer output is the consumer input at each hop: source → AST/KAG → snapshot/ordinal → CPU traversal → live GPU traversal → MCP response → canonical candidate resolution → ContextManifest readback. Report fixture, mock, component-live, and full-live results in distinct fields.

### P2 — Optional analysis and retrieval challengers

- [ ] **LIVE-GRAPH-14 — Separate graph and vector algorithms.** Keep cuGraph for graph operations (BFS, PageRank, components, and community algorithms); keep cuVS/CAGRA for ANN over qualified vectors; keep TurboVec as a separate compressed CPU-vector challenger. Do not treat vector neighbors as graph edges or give multiple semantic executors additional fusion/RRF votes.
- [ ] **LIVE-GRAPH-15 — Qualify graph communities.** Before Leiden, freeze the same admitted graph and an explicitly defined undirected/weighted projection. Compare a real GPU Leiden run with an independently available CPU reference using permutation-invariant partition metrics (e.g. ARI), modularity, connectedness, seed/reproducibility metadata, and runtime/memory. If a CPU Leiden backend is unavailable, mark parity blocked; do not substitute matching arbitrary community IDs.
- [ ] **LIVE-GRAPH-16 — Evaluate feature matrices/clustering.** Keep graph topology, `semantic_768`, native MRL, AE latents, 20×20 SOM coordinates, and KMeans labels as distinct feature/representation families with a frozen ordinal map and feature-schema digest. Compare CPU references with cuML/cuVS/GEMM challengers on the same rows; measure clustering stability, retrieval recall, latency, and memory. Cluster/UMAP/SOM coordinates are advisory and cannot define identity or add retrieval votes.
- [ ] **LIVE-GRAPH-17 — Gate semantic ANN.** Compare cuVS exact/CAGRA, Qdrant, pgvector exact, and TurboVec only on one source- and model-qualified `semantic_768` cohort with identical filters and query set. Verify returned IDs against PostgreSQL canonical identity and current source bytes, report Recall@K/latency/memory, and preserve one logical semantic lane. MRL 512/256/128 and learned latent 256/128/64 remain distinct challengers, never aliases or replacements by dimension alone.
- [ ] **LIVE-GRAPH-18 — Profile parsing and CPU parallelism.** Keep bounded JSON/JSONL parsing and CPU workers as the default until a representative profile demonstrates a bottleneck. Benchmark the current parser before introducing simdjson/N-API; enforce bounded buffers, worker count, cancellation, memory ceilings, stable ordering, and identity preservation. AVX2/AVX-512 are CPU instruction widths; SIMT/cuTile are GPU execution models and do not impose a shared alignment contract with TurboVec.
- [ ] **LIVE-GRAPH-19 — Defer ungrounded learning/routing.** Do not introduce HMM/agentic cognitive routing, RL, XGBoost-CUDA, PyTorch autograd/attention training, UMAP, or low-rank/Tang/EWIN recommendations into authority paths until the owner, labels/outcomes, frozen split, objective, baseline, reproducibility, and held-out metrics are explicit. Keep any future results advisory and revision-bound. Do not update CUDA/PyTorch/RAPIDS environments until the actual WSL interpreter, driver/toolkit compatibility, GPU-idle policy, and dependency lock are audited.

### Completion and no-fixture acceptance gates

- [ ] **LIVE-GRAPH-20 — Independent acceptance.** A reviewer not relying on the unit fixture verifies the exact live request, runtime/backend/device evidence, input and output checksums, CPU/GPU parity, canonical source readback, and ContextManifest receipt. Any absent stage remains `NOT_VERIFIED`/`BLOCKED`; never promote by extrapolating a health check, unit-test pass, model/API listing, generated receipt, stale snapshot, or TOC index.
- [ ] **LIVE-GRAPH-21 — Mutation boundary.** Keep PostgreSQL, Qdrant, Redis/Valkey, Neo4j, source files, and model artifacts read-only throughout analysis. Graph loading changes GPU residency and therefore requires its own explicit authorization/resource gate; persistence, indexing, cache population, agent dispatch, and repair application each require separate approval and their own independent readback.
- [ ] **LIVE-GRAPH-22 — Ledger closeout.** Update this existing OpenSpec owner only with observed evidence; record the exact command, exit code, receipt checksum, evidence class, input revisions, first blocker, and write totals. Rebuild/check generated TOC only through its existing generator after inspecting its scope; TOC inclusion is navigation, not validation or proof.

**Current first blocker:** `LIVE-GRAPH-01` has no freshly admitted current graph seed, while the live 8098 service reports `resident=null`. The next safe action is source/artifact owner reconciliation and a read-only admission audit; do not invoke BFS until an exact qualified snapshot is resident through an independently approved load path.

### HyperGraphRAG template alignment (2026-10-13; source inspection only)

- [x] Located the requested project at `C:\Users\james\Desktop\HyperGraphRAG-main\HyperGraphRAG-main` (not verified in Downloads during this pass). Its checked-in `LICENSE` is MIT; its README identifies it as the HyperGraphRAG research implementation and documents separate insertion/query APIs.
- [x] Inspected its defaults: JSON key/value storage, NanoVectorDB vector storage, and NetworkX graph storage; Neo4j exists as an optional backend. These are design references, not Parent Atlas-compatible authority or evidence of live Neo4j execution.
- [ ] Keep any adaptation behind existing Parent Atlas owners: canonical PostgreSQL packet/source identity and revision checks; existing typed graph/NetworkX executor; one logical semantic retrieval lane; ACE ContextManifest admission. Do not import its insertion pipeline, default vector store, or cache/write behavior into the canonical path.
- [ ] Before an implementation proposal, map one HyperGraphRAG concept (hyperedge/relation participants and bounded query expansion) to existing typed relation/snapshot contracts, then prove exact node/edge provenance and deterministic CPU parity on an admitted snapshot. Do not use a template fixture as live graph proof.

Status: template architecture is **INSPECTED**, not copied, installed, or executed. No Neo4j, database, vector-store, cache, GPU, or source writes were performed. `LIVE-GRAPH-01` and ACE admission remain blocked pending a current qualified graph seed and independent source/manifest readback.

### Bounded multi-seed NetworkX expansion (2026-10-13; fixture validation)

- [x] Added `bounded_multi_source_neighbors()` to the existing n-ary incidence projection. It accepts packet seeds, rejects duplicate/unresolved seeds and invalid budgets, traverses the existing fact/participant incidence graph with NetworkX, and returns deterministic `(node_key, hop_distance)` results under explicit hop/node limits.
- [x] Added fixture tests for deterministic multi-seed ordering, hop distances, unresolved/duplicate seeds, and budget rejection. This reuses Atlas's existing NetworkX owner and applies the useful HyperGraphRAG pattern (seed entities → bounded relation neighborhood); no third-party implementation code was copied.
- [x] Extended the snapshot digest to bind each fact's supplied checksum and canonicalized evidence-reference set. Added negative tests proving evidence/digest changes alter the snapshot checksum and blank/missing references are rejected. This binds supplied metadata; it does not independently verify the referenced evidence bytes.
- [ ] This is helper/fixture proof only. It does not search a live Neo4j/PostgreSQL graph, preserve or verify source-byte evidence, establish canonical packet identity, or admit results to ACE. Keep live graph, source-lineage, and ContextManifest gates open.

Validation: `PYTHONPATH=python py -3.13 -m pytest -q python/tests/test_nary_networkx_alignment_v1.py` — **12 passed**. No external service or data store was accessed.
