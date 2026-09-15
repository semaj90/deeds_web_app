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

- [ ] 2.1 Decide the concrete implementation: real `oaklib` Python package behind a small
      FastAPI sidecar (closest to the originally-described `:8095` design) vs. a lighter
      TypeScript-native resolver. Record the decision and rationale before writing code.
- [ ] 2.2 Define the resolver's request/response contract matching
      `specs/ontology-resolution-boundary/spec.md` exactly (label-to-concept, ancestor walk,
      never-mints-lineage-identity, explicit unavailable state).
- [ ] 2.3 Seed-grow `atlas_domain_ontology`: add new concept rows only (additive), do not modify
      or remove the existing 7. Draft the seed data as a reviewable file before any insert.
- [ ] 2.4 Implement the resolver against the grown vocabulary; unit-test all 4 spec scenarios
      (known-label resolves, unknown-label doesn't fabricate, ancestor walk, never mints
      lineage identity).
- [ ] 2.5 Implement and test the explicit `RESOLUTION_UNAVAILABLE` degraded path (no fallback
      guessing).
- [ ] 2.6 Extend `docs/.okf/schema.yaml` with an `ontology` block referencing
      `resolved_concept_id`/`ontology_revision`, following the existing `fabric_registry`
      convention (`canonical_authority: false`, references existing owners, not a new schema
      file).

## 3. Phase 2 — Bridge `feature_ontology_tuples` (forward-only cutover, per design.md D2)

- [ ] 3.1 Draft (do not apply) an additive migration: nullable `resolved_concept_id` and
      `resolution_state` (default `UNRESOLVED`) columns on `feature_ontology_tuples`. Manually
      review per this repo's Drizzle Safety Rule.
- [ ] 3.2 Dry-run the migration against a copy/transaction rollback; verify zero impact on
      existing 539,124 rows before considering apply.
- [ ] 3.3 Human review + explicit authorization checkpoint before applying the migration for
      real (same pattern as this session's stage-5/stage-11 gates — do not auto-apply).
- [ ] 3.4 Wire the extractor's write path (or a thin post-write hook) to call the Phase 1
      resolver and populate `resolved_concept_id`/`resolution_state` on NEW rows going forward.
      Existing 539,124 rows remain `UNRESOLVED` by design (see design.md D2) — no backfill in
      this phase.
- [ ] 3.5 Record a receipt (counts: total rows, newly-resolved rows, resolution-attempt failure
      rate) after the first live batch of new writes — read-only verification, not a promotion
      claim.

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
