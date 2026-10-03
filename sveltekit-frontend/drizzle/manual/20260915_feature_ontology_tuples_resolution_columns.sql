-- Phase 2 of openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap
-- ("Bridge feature_ontology_tuples", forward-only cutover per design.md D2).
--
-- Adds two nullable, additive columns so NEW rows can carry a resolved
-- concept ID (from the Phase 1 OAKLIB-equivalent resolver,
-- ontology-resolution-boundary-postgres.ts) instead of the raw,
-- extractor-invented `object_id` labels this table has carried exclusively
-- until now (e.g. object_id: "concept:fn-call", ungrounded).
--
-- Purely additive: no existing column touched, no NOT NULL, no backfill.
-- The existing 539,124 rows all get resolution_state = 'UNRESOLVED' via the
-- column DEFAULT (matches design.md D2 exactly: existing rows stay legacy/
-- unresolved by design, no mass backfill in this phase).
--
-- IMPORTANT CONTEXT recorded during drafting (2026-09-15): a live audit
-- found NO currently-running writer for this table. All 539,124 rows were
-- produced by exactly 3 historical bulk-batch runs (2026-08-11: 150 rows,
-- 2026-08-12: 90,450 rows, 2026-09-13: 448,524 rows) -- zero rows on any
-- other day, zero triggers, and the one script matching an
-- "INSERT INTO feature_ontology_tuples" literal in this repo
-- (scripts/atlas/generate-ontology-tuples.mjs) is stale (last touched
-- 2026-07-21), has zero callers, and targets a column shape
-- (domain_class/domain_confidence/decision/content_hash) that does not
-- match this table's live schema at all -- confirmed dead, not the real
-- producer. The real historical producer ('atlas-packets-ontology-v1',
-- per extractor_version) is not present as live code anywhere in this repo;
-- `scripts/atlas/plan-feature-ontology-regeneration-v1.mjs` (a read-only
-- planning script) already independently labels it "historicalProducer"
-- and names 'atlas-current-source-ontology-v2' as the not-yet-built
-- replacement. Task 3.4 in this change's tasks.md is scoped accordingly:
-- a reusable annotation helper for whatever writer runs next, not a hook
-- into a live extractor that does not currently exist.

ALTER TABLE feature_ontology_tuples ADD COLUMN IF NOT EXISTS resolved_concept_id text;
ALTER TABLE feature_ontology_tuples ADD COLUMN IF NOT EXISTS resolution_state text NOT NULL DEFAULT 'UNRESOLVED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feature_ontology_tuples_resolution_state_check'
  ) THEN
    ALTER TABLE feature_ontology_tuples
      ADD CONSTRAINT feature_ontology_tuples_resolution_state_check
      CHECK (resolution_state IN ('RESOLVED', 'UNRESOLVED', 'AMBIGUOUS', 'RESOLUTION_UNAVAILABLE'));
  END IF;
END $$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feature_ontology_tuples_resolved_concept_id
  ON feature_ontology_tuples (resolved_concept_id)
  WHERE resolved_concept_id IS NOT NULL;
