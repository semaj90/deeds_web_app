## 1. Discovery/audit (already done, cross-referenced)

- [x] 1.1 Confirm OAKLIB and the described `:8095` sidecar do not exist (repo-wide grep, zero
      hits) — see `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`, "Ontology / OAKLIB
      audit" section, 2026-09-15.
- [x] 1.2 Confirm `OntologyLinkedTupleV1`/`ontology-fanout-authority-v1.ts` exist and are
      well-built but dormant (0 rows in `atlas_ontology_linked_tuples`) — same audit.
- [x] 1.3 Confirm the live path is `feature_ontology_tuples` (539,124 rows), sample real rows,
      confirm extractor-invented concept labels with no resolution — same audit.
- [x] 1.4 Confirm `ontology_edges` is packet-similarity, not concept relations — same audit.
- [x] 1.5 Confirm `atlas_domain_ontology` (7 rows) is the only real, live `is_a` seed — same
      audit.
- [x] 1.6 Enumerate the six empty ontology-shaped tables as consolidation/archival candidates —
      same audit.

## 2. Phase 1 — Ontology resolution boundary (OAKLIB-equivalent)

- [x] 2.1 **Decision: TypeScript-native resolver, not a real `oaklib` Python package /
      FastAPI sidecar.** Rationale: (a) real `oaklib` targets OBO-family biomedical/scientific
      ontologies (GO, ENVO, MONDO, etc.) via `.obo`/OWL files — this repo's vocabulary is
      software/architecture concepts rooted in `atlas_domain_ontology`, a plain Postgres
      `is_a` table, not an OBO graph; adopting `oaklib` would mean either fabricating a fake
      OBO file to satisfy its loader or using none of its actual value. (b) Per
      `DEPENDENCY-CAPABILITY-GUARD-01` (CLAUDE.md), a new Python service/dependency requires a
      proven capability gap — none exists here: label→concept lookup, alias matching, and
      parent-chain walking are plain string/graph operations with zero need for OBO-specific
      tooling. (c) **Audited existing code before writing anything new, per Duplication
      Prevention — found a real, already-built, already-tested match**:
      `sveltekit-frontend/src/lib/server/atlas/taxonomy/entity-concept-taxonomy-v1.ts`
      exports `recognizeConceptV1()`, a pure function doing exactly this proposal's
      "resolve a label to zero-or-one concept ID via exact-id/canonical-label/alias match,
      never invent on failure" requirement — plus `ConceptV1`/`createConceptV1` (concept
      shape) and `createConceptBroaderThanV1` (parent/child hyperedge). Confirmed via
      `grep -rl "recognizeConceptV1"` (excluding its own spec file): **zero live callers** —
      dormant, same "well-built, unwired" pattern as `OntologyLinkedTupleV1` itself. The
      Phase 1 resolver therefore **reuses `recognizeConceptV1`/`createConceptV1` rather than
      writing a second label-matcher**, adding only: (i) a Postgres loader from
      `atlas_domain_ontology` into `ConceptV1[]`, (ii) an ancestor-chain walker over
      `parent_group_id` (simpler than `createConceptBroaderThanV1`'s full hyperedge — a plain
      chain read, no graph-write apparatus needed for a lookup), and (iii) the
      `RESOLUTION_UNAVAILABLE` wrapper this spec requires that `recognizeConceptV1` itself
      (a pure function, no I/O) has no reason to know about.
- [x] 2.2 Defined the request/response contract:
      `sveltekit-frontend/src/lib/server/atlas/contracts/ontology-resolution-boundary-v1.ts`
      (pure Zod schemas, no I/O) — `OntologyResolutionRequestV1`/`ResultV1`
      (label-to-concept) and `OntologyAncestorRequestV1`/`ResultV1` (ancestor walk), both with
      `resolutionState` including `RESOLUTION_UNAVAILABLE`, and a passthrough-only
      `callerContext.packetKey`/`sourceRef` (never validated/minted — matches spec.md's
      "Never mints Parent Atlas lineage identity" requirement).
- [x] 2.3 Seed-grew `atlas_domain_ontology` via a new script,
      `sveltekit-frontend/scripts/atlas/seed-atlas-domain-ontology-oaklib-phase1-v1.mjs`
      (`--dry-run` default, `--apply` flag, `ON CONFLICT (group_id) DO NOTHING`). 10 new rows
      grounded in real, frequently-observed `feature_ontology_tuples` labels sampled during
      this change's own audit (`frontend`/`frontend.sveltekit`, `database`/`database.postgresql`,
      `graph`, `gpu`, `machine-learning`, `cache`, `compiler`, `test`) — deliberately excluding
      noisy extractor artifacts also observed in that sample (`concept:2026`, `concept:src`,
      `concept:lib`, `concept:python311`: path/env noise, not real concepts; seeding those would
      just relocate the anti-pattern into the vocabulary). Dry-run reviewed first, then applied.
      **Verified live**: `atlas_domain_ontology` now has 17 rows (7 original + 10 new); the
      original 7 (`api`/`auth`/`devops`/`devops.env-config`/`devops.process-mgmt`/
      `error-handling`/`retrieval`) are byte-for-byte unmodified (re-selected and diffed against
      the pre-seed sample).
- [x] 2.4 Implemented the resolver:
      `sveltekit-frontend/src/lib/server/atlas/ontology-resolution-boundary-postgres.ts` —
      `resolveOntologyLabelV1()` (loads `atlas_domain_ontology` rows, builds `ConceptV1[]`
      with `conceptId = concept:<group_id>`, delegates matching to `recognizeConceptV1()`)
      and `resolveOntologyAncestorsV1()` (walks `parent_group_id`, cycle-guarded, truncates
      rather than fabricates on a dangling link). Unit-tested (`.spec.ts`, mocked `pool.query`
      per this repo's existing `ontology-linked-tuple-postgres.spec.ts` convention) — **6/6
      passing**: known-label alias resolution, unknown-label non-fabrication (asserts no
      INSERT side effect), ancestor walk (`concept:devops.env-config` → `[concept:devops]`,
      the exact spec.md example), passthrough-only `packetKey` (asserts no query references
      `packet_key`), `RESOLUTION_UNAVAILABLE` on a rejected query, and `AMBIGUOUS` on a
      duplicate-alias fixture (not silently picking one).
- [x] 2.5 `RESOLUTION_UNAVAILABLE` is the `catch` branch of both resolver functions above —
      covered by the "returns RESOLUTION_UNAVAILABLE... when the boundary is unreachable"
      test (2.4). No fallback guessing: on error, `conceptId`/`ancestorConceptIds` are always
      empty/null, never a best-effort guess.
- [x] 2.6 Extended `docs/.okf/schema.yaml` with an `ontology` block (right after
      `fabric_registry`, same convention: `canonical_authority: false`, references existing
      owners rather than duplicating them) — `required_fields: [resolved_concept_id,
      ontology_revision]`, `resolution_states` enum, and an explicit `never_mints` list
      matching spec.md's lineage-identity prohibition. Verified valid YAML via
      `js-yaml.load()` after editing (parses cleanly, `ontology` block present alongside the
      pre-existing `fabric_registry`, `root_schema`, etc.).

## 3. Phase 2 — Bridge `feature_ontology_tuples` (forward-only cutover, per design.md D2)

- [x] 3.1 Drafted the migration:
      `sveltekit-frontend/drizzle/manual/20260915_feature_ontology_tuples_resolution_columns.sql`
      — nullable `resolved_concept_id text`, `resolution_state text NOT NULL DEFAULT
      'UNRESOLVED'` (chose NOT NULL with a default over a nullable third state, since the spec's
      own `resolutionState` enum has no meaningful "null" case), a guarded CHECK constraint
      matching `OntologyResolutionStateV1Schema`'s 4 values, and a partial index on
      `resolved_concept_id`. Matches the exact precedent style of
      `20260915_codebase_chunk_index_whole_file_hash.sql`. Added matching Drizzle declarations
      to `schema-postgres.ts`'s `featureOntologyTuples` table (2 new fields + index).
      **Real finding recorded in the migration's own header comment, not glossed over**: a live
      audit before drafting found `feature_ontology_tuples` has **no currently-running writer**
      — all 539,124 rows came from exactly 3 historical bulk-batch runs (2026-08-11: 150,
      2026-08-12: 90,450, 2026-09-13: 448,524 — zero rows on any other day, zero triggers). The
      one script in this repo matching an `INSERT INTO feature_ontology_tuples` literal
      (`scripts/atlas/generate-ontology-tuples.mjs`) is confirmed dead: last touched 2026-07-21,
      zero callers, and its column list (`domain_class`/`domain_confidence`/`decision`) doesn't
      match this table's live schema at all. `scripts/atlas/plan-feature-ontology-regeneration-
      v1.mjs` (a real, already-existing read-only planning script) independently corroborates
      this — it already labels the historical producer `historicalProducer:
      'atlas-packets-ontology-v1'` and names `'atlas-current-source-ontology-v2'` as the
      not-yet-built replacement. This reframes task 3.4 below (see its note).
- [x] 3.2 Dry-ran the `ALTER TABLE`/CHECK-constraint statements in a transaction against the
      live DB, rolled back (verified via `docker exec ... psql <<'SQL' ... ROLLBACK`) —
      **`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block at all** (confirmed by
      first attempt failing with exactly that Postgres error), so it was excluded from the
      transactional dry-run and instead trusted against the already-proven-working
      `CREATE INDEX CONCURRENTLY` pattern from the whole-file-hash migration (same repo, same
      day, applied successfully). Result: `total=539124, resolved_populated=0,
      unresolved_count=539124` — confirms every existing row would default correctly to
      `UNRESOLVED`/`NULL`, zero unintended impact, then rolled back (nothing persisted).
- [x] 3.3 **APPLIED 2026-09-15** (explicit human authorization given, confirmed "yes continue
      migrate"). Ran `sveltekit-frontend/scripts/atlas/apply-feature-ontology-tuples-resolution-columns-v1.mjs`
      (same `apply-codebase-chunk-index-whole-file-hash-columns-v1.mjs` pattern — separate
      `pool.query()` calls, required for `CREATE INDEX CONCURRENTLY`). **Live readback confirms**:
      both columns exist (`resolution_state text NOT NULL DEFAULT 'UNRESOLVED'`,
      `resolved_concept_id text` nullable), the
      `feature_ontology_tuples_resolution_state_check` constraint exists, the
      `idx_feature_ontology_tuples_resolved_concept_id` partial index exists. **Zero unintended
      impact, exactly as dry-run predicted**: `539,124` total rows, `0` with
      `resolved_concept_id` populated, `539,124` with `resolution_state = 'UNRESOLVED'`. (Note:
      an earlier same-day attempt to run this script was denied by the session's own auto-mode
      permission classifier as a "Modify Shared Resources" action — re-authorized and re-run
      successfully this turn, not bypassed.)
- [ ] 3.4 **Reframed per the 3.1 finding above.** There is no live extractor write path to hook
      into today. The correct Phase 2 deliverable is a reusable annotation helper —
      `annotateFeatureOntologyTupleWithResolutionV1()` — that calls the Phase 1 resolver
      (`resolveOntologyLabelV1`) on a candidate tuple's `object_id`/label and returns the
      `resolved_concept_id`/`resolution_state` values ready to include in an INSERT, for
      whichever producer runs next (most plausibly `atlas-current-source-ontology-v2` once
      built, per the regeneration plan). Not yet implemented — depends on 3.3's authorization
      (the columns must exist before the helper's output has anywhere real to land), and on
      deciding whether to build it now (dormant, like `OntologyLinkedTupleV1` before it) or wait
      until a concrete new producer is being written. Flagging both options rather than
      guessing which the operator wants.
- [ ] 3.5 Record a receipt (counts: total rows, newly-resolved rows, resolution-attempt failure
      rate) after the first live batch of new writes — read-only verification, not a promotion
      claim. Blocked on 3.3/3.4; no new writes exist yet to measure.

## 4. Phase 3 — PG18 AIO-friendly bitmap fanout storage

- [x] 4.1 Verified live against this host's actual running PG18.4 instance (not assumed from
      docs): `server_version = "18.4 (Debian 18.4-1.pgdg12+1)"`, `io_method = worker` (PG18's
      cross-platform AIO default — this is a Debian container, so `io_uring` isn't in play; the
      worker-process model is), `io_combine_limit = 128kB`, `io_max_combine_limit = 128kB`,
      `effective_io_concurrency = 16`, `maintenance_io_concurrency = 16`. AIO is genuinely active
      on this instance (not the pre-18 synchronous-only behavior) — confirms design.md's premise
      is real, not aspirational, on this host.
- [x] 4.2 Drafted the materialized view:
      `sveltekit-frontend/drizzle/manual/20260915_feature_ontology_tuples_fanout_v1.sql` —
      `feature_ontology_tuples` filtered to `resolution_state = 'RESOLVED' AND
      resolved_concept_id IS NOT NULL`, built `WITH NO DATA` (deliberate — zero real resolved
      rows exist yet). **Real finding recorded in the file's own header, not silently worked
      around**: confirmed via `grep` that `evaluateOntologyFanoutAuthorityV1()` (the admission
      gate spec.md requires this view to filter through) has **zero production callers anywhere**
      — no table persists an admission decision at all, so this view can only filter on
      `resolution_state = 'RESOLVED'`, which is necessary but not sufficient for spec.md's
      admission-gate requirement. Recorded as a new Risk in design.md rather than faking a join
      that doesn't correspond to real data.
- [x] 4.3 Drafted 4 supporting indexes in the same file: a unique index on `tuple_id` (required
      for any future `REFRESH ... CONCURRENTLY`), plus btree indexes on `resolved_concept_id`,
      `subject_id`, `packet_key`.
- [x] 4.4 Dry-ran the full file in a rolled-back transaction (`CREATE MATERIALIZED VIEW` + 4
      indexes + a non-concurrent `REFRESH`, since `CONCURRENTLY` can't run in a transaction
      either, same as `CREATE INDEX CONCURRENTLY`) — all statements succeeded, `EXPLAIN` on the
      empty view correctly picked an `Index Scan` on `resolved_concept_id`. Real bitmap-scan
      proof used a proxy (documented precisely as a proxy, not the real filtered view, since that
      has 0 rows today): `EXPLAIN (ANALYZE, BUFFERS)` on the base table filtered by a real
      high-fanout label (`object_id = 'concept:sveltekit'`, 14,171/539,124 rows) shows a native
      `Bitmap Index Scan -> Bitmap Heap Scan` via `feature_ontology_tuples_object_idx` —
      **295ms cold-cache, 29.5ms warm-cache** — confirming the bitmap-scan mechanism this design
      relies on already works correctly on this table's real data/index shape at real scale.
      **This measurement also directly answered the operator's "would a LUT be faster?"
      question** — see design.md's new "Resolved consideration" section: decision is not to
      build a separate lookup table now (native bitmap scan + warm cache already performs well;
      no real fanout data yet to size a LUT against; would repeat this repo's own
      build-ahead-of-need mistake).
- [x] 4.5 Refresh cadence: **on-demand only, for this phase.** Confirmed live —
      `SELECT * FROM pg_available_extensions WHERE name = 'pg_cron'` returns 0 rows on this
      instance; `pg_cron` isn't even installable without a separate image/extension change, which
      itself would need its own `DEPENDENCY-CAPABILITY-GUARD-01` justification. No consumer is
      wired to this view yet (matches spec.md's "refresh cadence documented before first caller"
      gate — satisfied by recording it here, before any caller exists).
- [ ] 4.6 **NOT YET APPLIED — explicit human authorization required before running this for
      real**, same discipline as task 3.3. Drafted + dry-run-proven only.

## 5. Cleanup (Duplication Prevention)

- [ ] 5.1 Draft an archival plan (per this repo's archive-not-delete convention, with a
      manifest entry) for the six empty ontology-shaped tables identified in task 1.6 — archive
      only, never delete, and only after confirming zero live callers via the same
      caller-check discipline used elsewhere in this repo's audits.

## 6. Verification

- [ ] 6.1 Re-run this change's own capability scenarios (specs/ontology-resolution-boundary,
      specs/ontology-fanout-storage) as real tests, not just design-time checklist items.
- [ ] 6.2 Confirm no existing consumer of `feature_ontology_tuples` broke (additive-only schema
      change, so this should be a no-op check, but verify rather than assume).
- [ ] 6.3 Update `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`'s ontology audit
      section with a pointer to this change once Phase 1 is live, so the two records stay
      linked.

## 7. Correction: a real, LIVE OAK/oaklib FastAPI kernel already existed and was missed by
      task 2.1's original decision (2026-09-15, found while researching per operator request)

- [x] 7.1 **Real gap in the original Duplication Prevention audit, found and recorded
      honestly.** Task 2.1 decided "TypeScript-native resolver, not real `oaklib`/FastAPI" on
      the premise that no such sidecar existed. That premise was wrong. Live-verified this
      session: `python/atlas_oak_kernel.py` (402 lines) is a real FastAPI router
      (`prefix="/oak"`), mounted into `python/miniforge_nlp_sidecar_oak.py`, running in the
      **already-live** `miniforge-nlp-sidecar` Docker container (port 8095, confirmed via
      `docker ps` — "Up 2 hours (healthy)"). `curl :8095/oak/health` confirms **real `oaklib`
      0.7.4 is genuinely installed** (`available: true`), and an `adapterConfigured: true,
      adapterType: "atlas-postgres"` — it's currently wired to a `AtlasPostgresOntologyAdapter`
      (not a real OBO/OLS adapter) that reads/writes-nothing-but-reads two of the "6 empty
      ontology tables" task 1.6 flagged as archival candidates: `atlas_ontology_concepts`
      (concept_id/canonical_label/aliases, 11-value `concept_type` CHECK constraint including
      `domain`/`category`/`capability`) and `atlas_ontology_relations` (14-value `predicate`
      CHECK constraint: IS_A/INSTANCE_OF/ALIAS_OF/IMPLEMENTS/USES_SYSTEM/CALLS/FOLLOWS/
      IMPROVES/DEPENDS_ON/PART_OF/PRODUCES/CONSUMES/STORES_IN/READS_FROM). This schema is
      **richer and more deliberately designed than `atlas_domain_ontology`** (the flat, 17-row
      `is_a`-only table this change's Phase 1 grew and built a resolver against) — real FK
      constraints between the two tables, a GIN alias index, 11 concept types vs.
      `atlas_domain_ontology`'s implicit single kind. Both tables remain 0 rows in production
      (unchanged), so nothing was actually duplicated in data terms — but the CODE-level
      duplication (a second, independent, well-built resolution boundary) is real and should
      have been caught before task 2.1 committed to a decision.
- [x] 7.2 Traced ownership: `python/atlas_oak_kernel.py` and its `AtlasPostgresOntologyAdapter`
      belong to a SEPARATE, far larger, pre-existing OpenSpec change —
      `openspec/changes/parent-atlas-ontology-kernel/` (4,843-line tasks.md, proposal.md scoped
      to "OWL/SHACL profile-check admission... Preserve Postgres, Neo4j, oaklib, NetworkX,
      cuGraph, FastAPI, and MCP ownership boundaries"). That change's own stated scope is the
      profile-check/ConstraintV2/OWL-SHACL kernel mechanics, NOT label-to-concept resolution or
      the `feature_ontology_tuples` bridge this change (`parent-atlas-ontology-oaklib-fanout-
      bitmap`) covers — its "Modified Capabilities: None" and narrow Impact section confirm zero
      overlap with `feature_ontology_tuples`/`atlas_domain_ontology`/the fanout materialized
      view. Not fully read (4,843 lines exceeds this pass's bounded scope) — only cross-
      referenced for ownership boundaries, per Duplication Prevention rule 4 ("layered
      ownership, not competing owners") rather than treated as fully audited.
- [x] 7.3 **Resolution: layered ownership, not a rewrite.** `atlas_domain_ontology` (this
      change's Phase 1 vocabulary root) stays as the coarse DOMAIN-level bucket layer — already
      migrated, already matches `feature_ontology_tuples`' real `domain:X`-shaped labels sampled
      during the original audit, already has a working resolver + admin page. The live OAK
      kernel (`:8095/oak/*`, owned by `parent-atlas-ontology-kernel`) is a separate, deeper
      CONCEPT-level lexical/graph-traversal layer, real `oaklib` underneath, currently pointed at
      the still-empty richer schema. Neither replaces the other. Did NOT attempt to merge, move
      Phase 1's vocabulary root, or rewrite `parent-atlas-ontology-kernel`'s territory in this
      pass — that would be new, separately-scoped work requiring a real decision about which
      schema (`atlas_domain_ontology` vs. `atlas_ontology_concepts`) becomes canonical, out of
      bounds for a same-session correction.
- [x] 7.4 Confirmed via direct web search (INCATools/oaklib docs, berkeleybop.org) that real
      `oaklib`'s actual capability set is lexical/CURIE/synonym matching + graph traversal over
      pluggable backends (OLS/BioPortal/OBO/SPARQL) — it does NOT do dense/embedding-based
      retrieval or PyTorch-style classification. This matches `atlas_oak_kernel.py`'s own real
      endpoints (`lookup`/`search`/`ancestors`/`descendants`, all lexical/graph, zero embedding
      calls) — confirms this repo's existing separation is architecturally correct: OAK/oaklib
      owns lexical/CURIE resolution; `embeddinggemma` + Qdrant (768-dim) already owns dense
      semantic retrieval; `python/train_domain_classifier.py` (sklearn KMeans + MultinomialNB +
      LogisticRegression, NOT PyTorch — confirmed live: the sidecar's own `/health` reports
      `"torch": false`) owns offline weak-label classification. No new PyTorch classifier or
      dense-search sidecar is needed — all three layers already exist; nothing here should be
      duplicated a third time.
- [x] 7.5 Added a small, additive proxy so the admin page surfaces the live OAK kernel's health
      + lets an admin run a concept-level search against it, clearly labeled as a distinct
      system from the domain-level vocabulary above — see
      `sveltekit-frontend/src/routes/api/admin/atlas/ontology-resolution/+server.ts` (new
      `oakKernel` field on GET, new `POST .../oak-search` action) and the admin page's new "OAK
      kernel (concept-level, port 8095)" panel. Read-only proxy only; no write path added.
