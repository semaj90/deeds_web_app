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
- [ ] 3.3 **NOT YET APPLIED — explicit human authorization required before running this for
      real** (per design.md's own stated gate, and this repo's Drizzle Safety Rule). Drafted +
      dry-run-proven only. An apply script following the same
      `apply-codebase-chunk-index-whole-file-hash-columns-v1.mjs` pattern (separate
      `pool.query()` calls, required for `CREATE INDEX CONCURRENTLY`) is ready to write once
      authorized, but was deliberately not created yet — no script should exist that makes
      applying a 539K-row production migration one keystroke away from an unreviewed "yes
      continue."
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

- [ ] 4.1 Verify actual installed PostgreSQL 18.4 AIO configuration (`io_method` and related
      GUCs) live against this host's running instance — do not assume settings from memory or
      general PG18 documentation.
- [ ] 4.2 Draft (do not apply) the materialized view definition: `feature_ontology_tuples`
      filtered to `resolution_state = 'RESOLVED'` AND passed `OntologyFanoutAuthorityV1`
      admission (join against whatever table/flag records that admission decision — confirm the
      exact admission-record location before drafting the join, do not assume one).
- [ ] 4.3 Draft (do not apply) supporting indexes on `resolved_concept_id`, `subject_id`,
      `packet_key` on the materialized view.
- [ ] 4.4 Dry-run `EXPLAIN` against the drafted view/index combination (on a snapshot or
      transaction rollback) to confirm a `Bitmap Heap Scan` plan at real row-count scale before
      considering apply — matches `specs/ontology-fanout-storage/spec.md`'s bitmap-scan
      requirement.
- [ ] 4.5 Decide and document the refresh cadence and staleness bound (on-demand vs. scheduled)
      before any consumer is wired to read from this view.
- [ ] 4.6 Human review + explicit authorization checkpoint before applying the materialized
      view/index migration for real.

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
