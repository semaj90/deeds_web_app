# Tasks: parent-atlas-agentic-repair-bundle-integration

## T0 — Prerequisite (blocking everything else)

- [ ] Obtain the actual bundle and place it in a temporary integration area (e.g.
      `deeds_labs/staging/agentic-repair-bundle/`), **not** over any canonical path. Confirmed via
      `Glob` this session: none of the bundle's named files
      (`observe-error.mts`, `repair-state-hmm.mts`, `localize-symbols.mts`,
      `build-repair-context.mts`, `verify-repair.mts`, `record-repair-episode.mts`, `rrf.ts`,
      `rff.ts`, `networkx_pagerank_oracle.py`, `cugraph_pagerank_parity.py`, `cuvs_exact_knn.py`,
      `retrieval_ablation.py`, `repair_eval.py`) exist anywhere in this repo yet.
- [ ] Before wiring anything, diff each bundle repair-script against the existing repair spine:
      `sveltekit-frontend/scripts/agents/repair-loop.ts`,
      `sveltekit-frontend/scripts/phase79-agentic-repair.mts`,
      `simd-bridge/rust/hmm-repair/src/lib.rs`. Classify each bundle file as: replaces a weaker
      existing piece, redundant with a proven existing piece, or fills a genuine gap. Do not
      default to "genuine gap" without checking — see README rationale.

### T0a — Same classification already run against the orphaned root `src/` tree (2026-08-08)

Separately from the not-yet-supplied ZIP bundle, this repo already has an orphaned, never-wired
`src/` tree at the repo root (see `parent-atlas-workstation-openspec-task-board` history and this
session's earlier review) containing 146 files with no equivalent under `sveltekit-frontend/src/`.
Several of those files are directly relevant to this change's Phase 4/5/6 and were classified using
the same rule as above, so they don't need re-discovery when T0's bundle eventually arrives:

- **`src/lib/server/graph/pagerank-authority-contract.ts` + `pagerank-promotion-gate.ts`** —
  **WIRED AND LIVE-VERIFIED (2026-08-08), correcting an earlier misreading below.** Earlier note
  in this file said these target the empty `_v2` authority tables — **wrong, checked again**: the
  class's raw SQL queries `atlas_graph_authority_runs` / `atlas_graph_authority_scores` with no
  `_v2` suffix, which are the real, populated tables (50,164 score rows; one `promoted` run,
  40,754 nodes, confirmed via live `docker exec ... psql` query, not assumed). Copied both files
  into `sveltekit-frontend/src/lib/server/graph/`, type-checked clean (0 new errors vs. the
  existing 5-error baseline), then ran `PageRankPromotionGate.validateRun()` end-to-end against
  the live promoted run and found **three real, previously-undetected bugs**, all now fixed:
  1. `isfinite(pagerank_raw)` in the SQL — `isfinite()` has no `double precision` overload in
     PostgreSQL 18.4 (removed in PG17+; only `date`/`timestamp`/`interval` overloads remain,
     confirmed via `pg_proc`). Fixed to `pagerank_raw IN ('NaN'::float8, 'Infinity'::float8,
     '-Infinity'::float8)`, matching the working pattern already used in this repo's own
     `drizzle/0112_parent_atlas_graph_v2.sql`.
  2. The live "promoted" run had `normalization_tolerance = 1.9e-13` in the DB — traced to
     `scripts/atlas/promote-neo4j-pagerank-to-postgres.mts` line 139, which wrote `l1Diff` (the
     *observed* L1-sum error from that specific run) into the column meant to hold the
     *acceptable* tolerance threshold. Fixed the writer script (new `L1_SUM_TOLERANCE = 1e-6`
     constant, matching the script's own docstring) and corrected the one existing promoted row's
     stored value to `1e-6`.
  3. `summary.non_finite_count === 0` — `node-postgres` returns `COUNT()`/bigint columns as
     strings, so this strict-equality check was comparing `"0" === 0`, always `false`, regardless
     of actual data quality. Fixed to `Number(summary.non_finite_count) === 0` (two occurrences).
  After all three fixes: **all 7 gates PASS** against the live run
  (`scripts/atlas/verify-pagerank-promotion-gate.mts`, kept as a permanent regression check per
  this repo's "never delete working scripts" rule). This is materially more rigorous than the live
  `sveltekit-frontend/src/lib/server/topology/pagerank-authority.ts` (a 55-line resolver with no
  schema validation) and closes the "attach provenance" gap Phase 5 above calls for.
- **`src/lib/server/atlas/retrieval/candidate-fusion.ts`** — **WIRED (2026-08-08)**. Ported to
  `sveltekit-frontend/src/lib/server/retrieval/rrf-oracle.ts` — deliberately renamed from
  `candidate-fusion.ts` (which would invite confusion with RF6's eventual production owner) and
  decoupled from the orphan tree's `contracts/retrieval-candidate.ts` import in favor of a small
  local `RrfOracleCandidate` interface, so it has zero production coupling and stays a trustworthy
  independent oracle per Phase 4/T4's design. Type-checks clean. Not otherwise modified — no bugs
  found in this one (it's simple enough that there wasn't much to get wrong).
- **`src/lib/server/hmm/tool-router-*.ts`** (5 files) — real and internally consistent, but **not
  actually a hidden Markov model** despite the directory name — `inferToolState()` is a plain
  if/else classifier over score thresholds, `scoreTools()` is a fixed linear weighting, with no
  transition/emission probabilities or posterior belief update anywhere. It solves a different
  problem (MCP tool selection) than Phase 1's `repair-state-hmm.mts` (repair-state belief
  tracking) and should not be confused with it, or with the real `simd-bridge/rust/hmm-repair`
  crate (which is also unrelated — it's a Viterbi decoder for legal document sections, not tool
  routing or repair state — see README correction). Not part of this change's salvage list. The
  MCP-tool-selection problem this file gestures at without solving is picked up properly in T15
  below, built on the repo's real router (`router-types.ts`) instead of this orphaned stub.
- **`src/lib/server/atlas/ranking/*.ts`** (6 files, 14–26 lines each) — **inferior stub, do not
  salvage.** `ranking-features.ts::buildRankingFeatures()` hardcodes half its fields to `0`
  (`graph_score`, `telemetry_score`, `recency_score`, `validation_score`) and is materially weaker
  than the live `feature-matrix.ts` / `runtime-reranker.ts::blendScores()`. Adopting it would be
  exactly the "13-owner anti-pattern one level down" this whole taxonomy exists to prevent — leave
  it in the archive.

This root `src/` tree is otherwise still recommended for archival (per the repo's archive-not-delete
convention) once the two salvage items above are copied out — do not archive them by accident.
      default to "genuine gap" without checking — see README rationale.

## T1 — Phase 1 (repair spine smoke test)

- [ ] Wire only: `observe-error.mts` → `repair-state-hmm.mts` → `localize-symbols.mts` →
      `build-repair-context.mts` → `verify-repair.mts` → `record-repair-episode.mts`.
- [ ] Explicitly do NOT wire RFF, cuVS, cuGraph, PPR, or new graph traversal in this phase.
- [ ] Milestone gate: run the full loop on one known failing test. Record whether the loop
      closes (fingerprint → probabilities → ranked symbols → bounded context → manual patch →
      targeted verification → episode record). If it doesn't close, stop here — do not start T2.

## T2 — Phase 2 (evidence-layer wiring, not a second context engine)

- [ ] Replace the bundle's simple-JSON localization/context inputs with this repo's
      `trace_dynamic_context` (ast-grep / ts-morph / Tree-sitter / Graphify / Postgres / Qdrant).
- [ ] `trace_dynamic_context` must supply `symbolId`, `packetKey`, `filePath`, references, callers,
      tests, `denseScore`, `bm25Score`, `pagerankAuthority` to `localize-symbols.mts`.
- [ ] Verify `localize-symbols.mts` only ranks supplied candidates and does not independently query
      Postgres/Qdrant/Neo4j (would duplicate `trace_dynamic_context`'s job).

## T3 — Phase 3 gate (semantic_768 trust, before any RFF work)

- [ ] Confirm (not assume) `parent-atlas-semantic-768-canonical-contract`'s outstanding drift item
      is closed: EmbeddingGemma raw output == 768, Qdrant `semantic_768` collection dim == 768, no
      384-dim runtime dependence in the active retrieval path.
- [ ] Confirm L1/L2 (in-process + Bifrost) precomputed-vector caches are validated for dimension,
      not just a cold Ollama health probe.
- [ ] Do not proceed to T7 (RFF) until this task is checked off with live evidence, not assumption.

## T4 — Phase 4 / RF6 (RRF ownership — coordinate with `parent-atlas-retrieval-fusion-reachability`)

- [x] Do not let the bundle's `rrf.ts` become an automatic 14th production RRF implementation —
      wired as `sveltekit-frontend/src/lib/server/retrieval/rrf-oracle.ts` (2026-08-08),
      deliberately renamed and decoupled from any production contract, docstring explicitly
      forbids wiring it into a live path (see T0a above).
- [ ] Confirm RF6's canonical-owner decision (Option A: Qdrant-owns-fusion, or Option B:
      Parent-Atlas-owns-fusion) has actually been made — this task does not make that decision, it
      blocks on it.
- [ ] Use `rrf-oracle.ts` against frozen lane rankings and confirm mathematical agreement with
      whatever RF6 declares canonical — oracle exists now, this comparison run is still open.

## T5 — Phase 5 (PageRank into the feature row)

- [x] **Partially done (2026-08-08)**: the provenance/validation half of this phase is closed —
      `pagerank-authority-contract.ts` + `pagerank-promotion-gate.ts` are wired, live-verified,
      and 3 real bugs found in the process are fixed (see T0a above for full detail: `isfinite()`
      Postgres incompatibility, a tolerance/observed-error swap in
      `promote-neo4j-pagerank-to-postgres.mts`, and a string/number bigint comparison bug). All 7
      promotion gates now PASS against the live 40,754-node run.
- [ ] Still open: actually wiring a `pagerankAuthority: number` field into a live `FeatureRow` (the
      promotion-gate work above validates the *source* data is trustworthy; it doesn't yet feed
      that data into any ranking feature row — that's the remaining half of this phase).
- [ ] Confirm `pickPageRankAuthorityScore()` (already exists at
      `sveltekit-frontend/src/lib/server/topology/pagerank-authority.ts`) is the resolver used —
      do not reimplement it.
- [ ] Wire exactly one `pagerankAuthority: number` field with attached provenance
      (`graphRevision`, `normalizationRevision`) — not three separate pagerank/authority/graph
      fields, unless later measurement proves they're genuinely distinct signals.
- [ ] Blocked on `parent-atlas-graph-retrieval-proof`'s identity split landing before promoting any
      graph-snapshot-sourced value into this field.

### T5a — PostgreSQL 18 `isfinite()` removal: repo-wide follow-up (new, 2026-08-08)

Documented in root `CLAUDE.md` ("PostgreSQL 18 vs 17 — removed function overloads"). Narrow,
case-sensitive `Grep` for `isfinite(` (not `isFinite`/`Number.isFinite`, which are unrelated real
JS) found exactly 4 hits repo-wide: this change's own docs, one unrelated Python file (`math`/
`numpy` `isfinite` is real and fine there), and two Postgres-facing hits that matter:

- [x] `sveltekit-frontend/src/lib/server/graph/pagerank-promotion-gate.ts` — fixed (T0a/T5 above).
- [x] **Fixed (2026-08-08).** `sveltekit-frontend/drizzle/manual/0099_pagerank_authority_contract.sql`
      — patched in place: `isfinite(pagerank_raw)` / `isfinite(pagerank_l1)` →
      `pagerank_raw NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)` (same for
      `pagerank_l1`). **Verified safe before editing**: `\d atlas_graph_authority_scores` on the
      live table shows only 3 CHECK constraints actually attached
      (`authority_band`, `contract_version`, `normalization_method`) — the `isfinite`-based
      constraints in this file were never actually applied to the live table, so this was never an
      active production landmine, only a fresh-deploy/replay risk. Patch-in-place was correct here
      (not an additive migration) because there was no live constraint to alter — editing the file
      only affects future fresh applies. **Verified after editing**: ran the corrected file
      directly against the live DB (`docker exec -i legal-ai-postgres psql ... < 0099_*.sql`) —
      completed cleanly, every object already exists so it's a safe no-op (`NOTICE: relation ...
      already exists, skipping` for every statement, zero errors).
- [ ] No other SQL in the repo currently uses `isfinite()` on a numeric column (confirmed via the
      same grep) — this is a two-file problem, not a systemic one. No broader sweep needed unless
      new SQL is written copying the old pattern.

## T6 — Phase 6 (staged FeatureRow)

- [ ] Ship `FeatureRowV1` (packetKey, dense, sparse, rrf, ast, pagerankAuthority, freshness,
      crossEncoder, featureRevision, graphRevision) — no RFF or latent128 fields yet.
- [ ] Do not add `rffSimilarity` (→ `FeatureRowV2`) or `latent128Similarity` (→ `FeatureRowV3`)
      until their respective phase gates (T7–T8, T10) pass.

## T7 — Phase 7 (RFF representation contract)

- [ ] Define the fixed contract: `representationId: 'rff_256'`, `sourceRepresentationId:
      'semantic_768'`, `algorithm: 'random_fourier_features'`, `kernel: 'rbf'`, `outputDimension:
      256`, fixed `gamma`, fixed `seed` (e.g. 1337), `revision: 'atlas_rff_rbf_v1'`.
- [ ] Verify determinism: same `semantic_768` input → identical `rff_256` output across repeated
      runs (this is the whole point of the fixed seed — test it explicitly, don't assume it).
- [ ] Verify the projection approximates the intended kernel: compare
      `cosine(semantic_768_a, semantic_768_b)` against `dot(rff_256_a, rff_256_b)` on a sample set.

## T8 — Phase 8 (RFF stays reranking-only, not indexed)

- [ ] Compute RFF similarity only on the final fused candidate set (~50-150 candidates), not the
      whole Qdrant collection.
- [ ] Do not create a `qdrant_collection_rff_256` collection in this pass.
- [ ] Only revisit creating a dedicated RFF collection after T9's evaluation shows RFF improves
      candidate *generation*, not just reranking of an already-fused set.

## T9 — Phase 9 (Domain 10 evaluation gatekeeper)

- [ ] Check `phase-2f1-real-evaluation-corpus` before building a new labeled query/result set from
      scratch — it may already own this.
- [ ] Run ablation variants A (baseline) → B (+RRF) → C (+RFF) → D (+RRF+RFF) → E later (+latent128).
- [ ] Measure Recall@5, Recall@10, MRR, NDCG@10 for retrieval; Recall@1/@5 localization accuracy,
      repair success rate, false-edit rate, and latency for the repair loop.
- [ ] Do not attribute a ranking change to the wrong lane — RRF's effect (candidate recall) and
      RFF's effect (reranking discrimination) must be measured as separate variants, not conflated.

## T10 — Phase 10 (latent128 byte contract)

- [ ] Prove — do not assume — `latent_128 BYTEA`'s length, dtype, dimension, producer, source
      representation, and projection revision.
- [ ] Define and use a `LatentVectorContract` decoder before treating any decoded value as a
      feature input.
- [ ] Only then add `latent128Similarity` to `FeatureRowV3`.

## T11 — Phase 11 (NetworkX ↔ Neo4j GDS parity) — blocked

- [ ] Blocked on `parent-atlas-graph-retrieval-proof`'s identity split landing (do not run against
      an unpromoted/provisional graph snapshot).
- [ ] Once unblocked: run `networkx_pagerank_oracle.py` against a frozen Graphify snapshot; compare
      top-100 overlap, Spearman correlation, max absolute difference, L1 sum vs. live Neo4j GDS.

## T12 — Phase 12 (Neo4j GDS ↔ cuGraph parity) — blocked on T11

- [ ] Run `cugraph_pagerank_parity.py` only after T11 passes.
- [ ] Promote cuGraph only if: same snapshot, same damping factor, same convergence policy,
      materially similar rank order, and materially better runtime than Neo4j GDS.

## T13 — Phase 13 (Qdrant ANN ↔ cuVS exact parity)

- [ ] Run `cuvs_exact_knn.py` as a `semantic_768` exact-KNN oracle against Qdrant ANN results on
      the same query set, before testing CAGRA against the same oracle.
- [ ] Treat cuVS output as supporting evidence for repair localization ("similar code that
      previously solved a similar problem"), not the primary localizer — the primary localizer
      remains the symbol/call/test graph path from T1–T2.

## T14 — Phase 14 (closed-loop repair on a replay corpus) — blocked on T1–T13

- [ ] Only start once T1–T13's foundations are individually proven.
- [ ] Run the full loop (`observe error → fingerprint → HMM posterior → trace_dynamic_context →
      localize-symbols → repair context → external patch proposal → ast-grep edit →
      verify-repair → HMM update → record-repair-episode`) against a replay corpus of real,
      historical failures — not synthetic ones.

## T15 — Real Viterbi + Baum-Welch HMM for MCP tool selection (separate concern from T1–T14)

- [x] ~~Verify whether `RouteTrace` telemetry already has 160+ diverse rows~~ — **checked
      2026-08-08**: unreachable as originally phrased. `telemetry-ranking-bridge.ts`'s three
      loaders (`loadHistoricalMetrics`, `loadTransitionCounts`, `loadCacheStats`) are hardcoded
      mocks (`// TODO: Implement actual database query`), and `outcome_ledger`/`tool_call_events`/
      `proposed_tool_calls` do not exist anywhere in `sveltekit-frontend/src/lib/server/db/`
      (confirmed via `Grep`, zero hits). There are 0 traces because there is no write path, not
      because collection is merely slow.
- [ ] **T15.0 (new, blocking, do this first)**: design and build the actual persistence layer —
      Drizzle tables for `outcome_ledger`, `tool_call_events`, `proposed_tool_calls` (or a
      consolidated equivalent), plus the write calls from `viterbi-router.ts`'s
      `buildRouteTrace()`/`finalizeTrace()` that currently only construct in-memory objects and
      never persist them anywhere.
- [ ] T15.0a: wire `getCacheWarmth()`'s existing `// TODO: Query Redis cache statistics` to
      Bitfrost (this repo's real Redis L2 cache) — this TODO already correctly identifies where
      cache-warmth data belongs; it just isn't implemented.
- [ ] T15.0b: send `RouteTrace` spans to Langfuse (real, port 3030, already used elsewhere in this
      repo) once T15.0's write path exists — free observability instead of a bespoke dashboard.
- [ ] T15.0c: do NOT make Kafka CDC (`parent-atlas-kafka-projection-initiative`) a dependency of
      T15.0 — that initiative is an explicit zero-spec stub whose own README lists
      scope-absorption by other initiatives as a non-goal. Revisit CDC only after T15.0's tables
      and write path are real, as a possible downstream fan-out mechanism, not a prerequisite.
- [ ] Once T15.0 has been live long enough to accumulate 160+ diverse traces, re-check this
      checkpoint for real before proceeding to Baum-Welch fitting below.
- [ ] Re-parameterize the existing proven Viterbi kernel (from
      `sveltekit-frontend/src/lib/server/analysis/hmm-section-classifier.ts` — this is the ONLY
      confirmed-real Viterbi implementation in this repo; do NOT modify that file itself, it's
      correct for its own legal-section-classification purpose, and do NOT use
      `router/viterbi-router.ts` as a reference despite its name — checked and confirmed above to
      contain no DP table, no log-probabilities, no backpointer array, just if/else logic) for
      `RouterState` (11 states, `router-types.ts`) instead of the 7 legal-document states.
- [ ] Define emission distributions over the router's own existing per-candidate signals
      (`semanticScore`, `intentScore`, `schemaFitness`, `transitionScore`, `healthScore`,
      `historicalSuccessScore`, `provenanceScore`, `latencyScore`, `topologyScore` — already
      computed in `ToolCandidate`) — do not reuse the legal-document word-emission tables.
- [ ] Fit Baum-Welch **offline, batch, against historical `RouteTrace` data only** — never online,
      never per-request.
- [ ] Keep `ALLOWED_TRANSITIONS` as a hard 0/1 safety mask; learned transition probabilities only
      re-weight among already-legal transitions, never permit an illegal one (e.g. never let a
      learned model skip `VALIDATE` before `SYNTHESIZE` when `requiresExactSourceRefs: true`).
- [ ] Evaluate the Viterbi-decoded state path against `deterministic-tool-ranker.ts`'s current
      per-step ranking on the same replay corpus (tool-selection agreement rate, downstream task
      success rate, recovery-loop length) before promoting it to replace any current output.
- [ ] Do not touch `hmm-section-classifier.ts` or the `hmm-repair` Rust crate as part of this task
      — they are correct, unrelated implementations (legal document structure) and must not be
      repurposed or relabeled to imply tool-routing support.
- [ ] Do not resurrect or wire the orphaned `hmm/tool-router-hmm.ts` (T0a) — it has no
      transition/emission model at all and is not a starting point for this work.

## T16 — Proto/RPC tool registry retrieval (feeds T15's `availableTools`, no T15.0 dependency)

- [x] **Corrected `reports/parent-atlas-open-lanes-todo.md` item #12's stale checkboxes** (checked
      2026-08-08, not trusted as written): `audit-proto-registry.mjs` already exists (699 lines,
      real dry-run/apply, documented lineage contract) and has already been run in `--apply` mode
      (`docs/reports/proto-registry-audit.json`, 2026-07-04: 13 proto files, 12 services, 61 RPC
      methods, 61 rows written to Postgres + Qdrant + Redis each). The report's `- [ ]` on these
      three lines is wrong; only the two retrieval-wiring checkboxes below are genuinely open.
- [ ] Verify what currently populates `RouterObservation.availableTools` before replacing it.
- [ ] Wire a Qdrant top-K query over the 61 packetized RPC-method manifests
      (`domain_class=mcp_agents`) ranked by embedding similarity to the current query, as the new
      `availableTools` source — this is the "Gemma4 gets top-K tools, not flat 300+" goal the
      source report names but never wired.
- [ ] Wire `sveltekit-frontend/src/lib/server/router/authority-ranking-bridge.ts::
      scoreTopologyAuthority()` — currently a hardcoded `return 0.5` mock — to real Neo4j PageRank
      + `couchdb:pagerank_scores` Redis cache. Reuse `pickPageRankAuthorityScore()` (Phase 5) —
      do not write a third PageRank reader.
- [ ] Write `SIMILAR_TOOL` Neo4j edges (tool co-selection or caller/callee relationships) — the
      "hub score in SIMILAR_TOPOLOGY edges" input `authority-ranking-bridge.ts` already expects
      but has no writer for.
- [ ] Re-run `audit-proto-registry.mjs --apply` after the above to refresh the packet count (13
      proto files scanned on 2026-07-04 may have grown since).

## T17 — Correction: real infrastructure found for most of the Appendix's "speculative" material

- [x] **Swept the repo (2026-08-08)** for Kafka CDC, tensor/LLM inference, RotorQuant/TurboQuant,
      Redis-Valkey centroid/Bitfrost, GPU token remapping, NES/CHR97 glyph caching, 4D topology
      manifolds, HypergraphRAG, Engram, ontology-linked `.okf` YAML — found real, substantial,
      wired implementations for most of it (see proposal.md Phase 17 for the full file list):
      `quaternion-manifold.ts` (602 lines), `hypergraph-4d.ts` (1,501 lines),
      `manifold4-search.ts`, `centroid-cache.ts` (583 lines), `token-map/` (service + mapper +
      types + tests), `cartridge/glyph-tile-engine.ts` + `glyph-mappers.ts`, `engram-bigram.ts` /
      `engram-memory.ts` (confirmed compiled into the production build), and a fully-generated
      `docs/okf/parent-atlas/` bundle with a real `gaps/` directory.
- [ ] File a correction against `parent-atlas-okf-knowledge-layers` — its README says
      `PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1` is "design/audit only, not yet implemented," but
      `docs/okf/parent-atlas/index.md` already exists with `status: PARTIAL_PROVEN` and 9 real gap
      writeups. One of the two documents is stale; reconcile in that change, not here.
- [ ] Before designing any new 4D-manifold, hypergraph, token-remap, glyph-cache, or Engram
      mechanism anywhere in this change (especially Phase 15's HMM work, which already touches
      `manifold4` via `quaternion-manifold.ts::hmmAxisMultiplier()`), read the files listed above
      first — do not duplicate them.
- [x] Confirmed still genuinely absent, no correction needed: Kafka CDC (zero `kafka` hits in
      `sveltekit-frontend/src/`), softcap/Ewin-Tang ℓ2-sampling (zero hits), and
      "isoquant"/"quanterion" as distinct concepts (likely conflation with the real, documented
      `rotorquant`/`TurboQuant` naming).

## T18 — External architecture brief reconciled, not implemented (2026-08-08)

- [x] Reconciled the user-supplied K3/KDA-inspired architecture brief's gate checklist (G0–G28)
      against this document's Phase 1–17 numbering — see proposal.md Phase 18 for the full
      mapping table. Canonical going forward: **this document's phase numbers**, not the brief's
      G-numbers (which duplicate themselves: G12–20 repeat verbatim as G21–28 in the source).
- [x] Confirmed the brief's `AtlasRoutePacket` proposal is a restatement of this document's own
      `FeatureRowV1`/`V2`/`V3` (Phase 6) + `pagerankAuthority` provenance (Phase 5) — not new
      scope. Action item: reconcile field names between the two before either grows further.
- [x] Confirmed the brief's "next 10 actions" list matches this document's Phase 1/2/4/6/10/11/12/14
      ordering for items 1–9. Item 10 (OpenWiki/module-crawler work) is genuinely out of scope for
      this change — flagged for `parent-atlas-okf-knowledge-layers` or a new sibling instead.
- [ ] New graph-traversal sub-scope surfaced by the brief, not previously itemized here: Louvain/
      Leiden community detection, canonical community-taxonomy records, taxonomy-aware BFS,
      personalized PageRank, weighted-Dijkstra baseline, semantic best-first search. All belong
      under Phase 2/3's existing scope (graph traversal + structural features) — do not design
      these until `parent-atlas-graph-retrieval-proof`'s identity split unblocks Phase 2/3 (same
      blocker already recorded for the rest of that phase).
- [ ] Quaternion/similarity-learning-before-Qdrant, TurboQuant-after-frozen-embedding sequencing
      note captured in proposal.md — cross-check against `parent-atlas-semantic-768-canonical-
      contract` before any future embedding-specialization work, don't quantize a moving target.
- [ ] Check whether `kag record_agent_run` (from the brief) and Phase 14's
      `record-repair-episode.mts` (once the bundle exists) should be unified into one tool instead
      of two overlapping learning-flywheel entry points.
- [ ] **G4 (fresh Graphify revision)** — promoted from a proposal.md note to an actual task since
      it's been independently flagged three times this session: the brief's gate checklist twice,
      and this session's own `[Graph stale]` hook warnings showing `codebase-graph.json` at
      8,120+ minutes (~5.6 days) old. Run `npm run graphify:daily` from `sveltekit-frontend/` to
      refresh the Karpathy map + KAG notes before trusting any graph-dependent gate above
      (Phases 2, 5, 11–13 all read from this graph). Not run yet — needs explicit go-ahead since
      it touches live services, not just docs.

## Non-goals (repeat from proposal.md — do not action these under this change)

- Do not add the bundle's files to this repo as part of this change — T0 (obtaining/placing the
  bundle) is a prerequisite this change cannot itself satisfy.
- Do not decide RF6's Option A vs. Option B here — cite and block on
  `parent-atlas-retrieval-fusion-reachability`'s decision.
- Do not build any of the Appendix research material (external-MoE routing, GEPA policy evolution,
  Engram n-gram memory, QLoRA training-tuple format) under this change — no owner module, no phase
  gate, no measurement plan exists for any of it yet. If pursued, it needs its own OpenSpec change.

## T19 — `npm run graphify:daily` findings (2026-08-09), one fixed, four still open

Running the stale-graph refresh (see T18's G4 note) surfaced 5 concrete issues. One is fixed
(below); the other four are independent, not yet investigated, and can be picked up separately —
none of them block anything else in this change.

- [x] **Fixed**: `atlas_feature_map` table didn't exist — `sync-atlas-feature-map-from-qdrant.mjs`
      failed every apply run with `relation "atlas_feature_map" does not exist`, while its own
      success log printed unconditionally right after logging that failure (a second, independent
      bug). Created `drizzle/manual/0102_atlas_feature_map.sql` (schema derived from the script's
      own UPSERT statement) and gated the success log on `failed === 0`. Re-ran the script —
      confirmed the missing-table error is gone and the full write path executes.
- [x] **Root cause of the truncation found and fixed**: the "IllegalArgu..." cutoff wasn't a log
      artifact — `scripts/atlas/neo4j-graph-enrich.mjs` lines 596-597 literally did
      `e.message.slice(0, 80)` before both the console warning and the saved `summary.gates.GDS3`
      value, discarding the real Neo4j error at the source (confirmed by reading the code, not
      guessed). Removed the truncation on both lines.
- [x] **GDS3 root cause found and fixed (2026-08-09)**: real error was
      `Invalid relationship projection, one or more relationship types not found:
      'DYNAMIC_IMPORTS|IMPORTS|SIMILAR_TOPOLOGY'`. Confirmed live via
      `CALL db.relationshipTypes()`: `IMPORTS` and `DYNAMIC_IMPORTS` don't exist anywhere in this
      Neo4j instance — only `SIMILAR_TOPOLOGY` (plus 22 unrelated types) actually exist. `gds.graph.
      project` hard-rejects projecting a relationship type with zero occurrences. Fixed
      `neo4j-graph-enrich.mjs`'s `ensureProjection()` to query `db.relationshipTypes()` first and
      filter the projection map down to types that actually exist (parameterized via `$relTypes`,
      verified the `neo4j()` helper supports query params before relying on it), instead of
      hardcoding all 3 types unconditionally. **Re-ran and confirmed live**: GDS3/GDS4/GDS5 all
      flipped from FAIL/DEGRADED/SKIP to PASS. GDS7 (Qdrant payload patch, "0 patches") is still
      WARN — separate item below, not caused by or fixed by this change.
      **Follow-up, not done here**: figure out why `IMPORTS`/`DYNAMIC_IMPORTS` edges were never
      written to Neo4j at all — that's a real ingestion gap, not just a defensive-code issue; the
      fix above makes the pipeline resilient to it but doesn't restore the missing edges.
- [ ] **Qdrant payload patch: 0/2114 files matched (0%)**: the same `neo4j-graph-enrich.mjs` run
      built a path→point-id index with "0 unique paths" and couldn't patch any of 2,114 candidate
      files. Sample misses logged: `src/lib/server/ai/hermes/test-dispatcher.ts`,
      `src/routes/api/test/cache-demo/+server.ts`, and 3 similar `api/test/*` routes — worth
      checking whether the path-normalization logic handles these specific paths differently, or
      whether the index-building step itself is broken (0 unique paths from 2,114 candidates is
      suspicious regardless of matching logic).
- [ ] **`qdrantReachable: false`** reported by `qdrant-tag-mirror.mjs --apply` in the same run,
      immediately contradicted by the next pipeline step (`sync-atlas-feature-map-from-qdrant.mjs`)
      successfully scrolling 105,761 Qdrant points seconds later. Likely a bad/stale health check
      in `qdrant-tag-mirror.mjs` rather than real intermittent connectivity — check its probe logic
      before assuming a real outage.
- [x] **Fixed**: `tree-sitter` was one patch version behind (0.25.0 → 0.25.1) per graphify's own
      auto-generated draft `openspec/drafts/2026-08-09_tree-sitter.md`. Bumped in
      `sveltekit-frontend/package.json`; lockfile is gitignored in this repo so it syncs on the
      next `npm install`, no forced native rebuild needed here.
- [x] **Not a bug, verified by reading the code** (was wrong to flag this): the
      `graphify:daily partial` / `graphify:daily complete` pair in
      `run-graphify-daily-startup.mjs` is deliberate, not contradictory — the code's own comment
      (lines 83–91) explains `complete` is a VS Code task lifecycle terminal marker that must print
      on every exit path (success or failure) for the `isBackground:true` task's `endsPattern`
      matcher to fire, while `partial` is a separate data-completeness signal. Two different
      concerns printed together on purpose. No fix needed.

## T20 — To-do list carried forward from T19 (2026-08-09), genuinely open, next session

T19 closed 4 of its original 5 findings this session (`atlas_feature_map` table, tree-sitter
version, the false-alarm log lines, and — the deepest one — GDS3's real root cause). These two
items are what's left, both requiring real investigation rather than a quick fix:

- [x] **Found the writer, fixed 2 real bugs, dry-run proven — `--apply` to Neo4j still not run.**
      The writer is `scripts/atlas/sync-graph-truth-neo4j.mjs` (reads
      `sveltekit-frontend/memory/graphify/deep/deep-import-edges.jsonl` +
      `sveltekit-frontend/memory/index/ast-relations.jsonl`, `MERGE`s `IMPORTS`/`TEST_COVERS_FILE`
      into Neo4j with `--apply`). It was never producing edges because it hard-crashed on query 1,
      every run, before ever reaching Neo4j: `SELECT ... summary ... FROM parent_atlas_documents`
      referenced a column that view doesn't have, and the `atlas_feature_map` query selected
      `som_bmu_row`/`som_bmu_col`, columns that never existed in that table's real schema. Fixed
      both queries to match live schema (commit `5312a12a82`). Verified live: dry-run on a
      2,000-row slice now computes 8,479 `IMPORTS` + 8,875 `TEST_COVERS_FILE` edges (previously 0,
      every time). **Not yet done**: nobody has actually run
      `node scripts/atlas/sync-graph-truth-neo4j.mjs --apply` for real — the one attempt this
      session was interrupted by a user redirect before it could execute. This is no longer an
      investigation, just an unrun command — next session should run it (start bounded, e.g.
      `--limit=5000`, confirm via `CALL db.relationshipTypes()` that `IMPORTS` now appears, then
      run unbounded) before trusting any PageRank/community-detection run downstream.
- [x] **Qdrant payload patch — root cause found, fixed, applied for real.** Same root cause as the
      IMPORTS fix above, one layer upstream: `scripts/atlas/sync-atlas-feature-map-from-qdrant.mjs`
      read `p.file_path ?? p.sourceRef` from Qdrant payloads, but `codebase_chunks_768` payloads use
      snake_case `source_ref` (confirmed live via a direct payload dump) — `p.sourceRef`/`p.file_path`
      never existed, so 105,761 points collapsed to 1 "unique file" on every run, which is what
      starved `atlas_feature_map` (0 rows) and cascaded into the "0/2114 matched" figure downstream.
      Fixed the field lookup + added a placeholder-value filter (commit `5312a12a82`); re-ran for
      real: `atlas_feature_map` now has 4,512 rows, 0 failures. Re-ran `qdrant-tag-mirror.mjs
      --verify --apply`: 1,128/2,114 eligible (up from 0), 1,128 patched, 0 failures. Also confirmed
      the `qdrantReachable: false` reading was a false alarm by design, not a real outage —
      `qdrant-tag-mirror.mjs` only sets that field when `--verify` is passed; without the flag it
      just defaults to `false`. With `--verify` it correctly reports `true`.

## T21 — New canonical `graphify/` output directory (2026-08-09), infra only

Standing up a single gitignored-but-`rg`-searchable location for graphify pipeline output
(`graphify/`, see `graphify/README.md`), replacing the current sprawl across `.tmp/`,
`docs/reports/`, `docs/graph/`, and `sveltekit-frontend/memory/graphify/` (280+ hardcoded output
paths across `scripts/atlas/*.mjs`, many cross-referencing each other's exact paths — e.g. the two
scripts fixed in T20 above read `sveltekit-frontend/memory/graphify/deep/deep-import-edges.jsonl`
and `.tmp/addressable-packets.ndjson` directly). Added `/graphify/*` to `.gitignore` (with
`!/graphify/README.md` kept tracked) and `!/graphify/` to `.rgignore`, matching the existing
`.opencode/ndjson/` pattern.

Also moved `docs/reports/frozen-graph-snapshot-v2.json` (464MB, was gitignored in place, was
blocking `git push` from an earlier commit — GitHub's 100MB hard limit) into
`graphify/frozen-graph-snapshot-v2.json`, and updated its 4 real consumers:
`scripts/atlas/stage5-pagerank-authority-validated.mjs`, `scripts/atlas/export-graph-snapshot-v2.mts`,
`scripts/atlas/compute-pagerank-neo4j-v2.mjs`, `python/parent_atlas_networkx_pagerank.py`.

**Deliberately infra-only, by explicit user decision**: migrating the other 280+ existing graphify
script output paths into `graphify/` is a separate, audited sweep per this repo's own
Consolidation Sweep Rules (CLAUDE.md) — canonical-vs-duplicate report first, then patch only the
safe cases. Not started.
