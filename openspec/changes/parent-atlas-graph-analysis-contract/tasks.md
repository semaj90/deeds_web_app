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

## GA1–GA9 — not started

Each gets its own task entry only when actually picked up (status-language
discipline — no pre-written speculative checklists). See README.md's gate
table for what each proves.

## Patch B–I — not started

See README.md's patch-order table. Patch B (persistence — 4 new tables) is
next in sequence, but is **not** implied by completing Patch A — each patch
gets its own explicit go-ahead per this repo's established gate-by-gate
discipline for external/large plans.

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
