-- Phase 3 of openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap
-- ("PG18 AIO-friendly bitmap fanout storage"), design.md D3.
--
-- Materialized view + indexes over feature_ontology_tuples, NOT a new
-- physical table (Duplication Prevention -- 6 existing ontology-shaped
-- tables are already dead weight; a 7th is the wrong reflex here).
--
-- HONEST SCOPE LIMITATION, found and recorded during drafting (2026-09-15):
-- spec.md's "No bypass of admission gate" requirement says this view's
-- source query must filter on rows "already marked admitted by
-- OntologyFanoutAuthorityV1-gated promotion." A live audit found that gate
-- (evaluateOntologyFanoutAuthorityV1(), ontology-fanout-authority-v1.ts) has
-- ZERO production callers -- it is a pure validation function, never wired
-- to any writer, and NO table anywhere persists an admission decision. This
-- view therefore filters ONLY on resolution_state = 'RESOLVED' (Phase 2),
-- which is necessary but not sufficient to satisfy that spec requirement.
-- Do not treat this view as admission-gated until evaluateOntologyFanoutAuthorityV1
-- is actually wired to a caller that persists its result somewhere this view
-- can join against -- flagged, not silently worked around.
--
-- Bitmap-scan proof (task 4.4, real data, not fabricated): EXPLAIN ANALYZE
-- on this same base table, filtering by a real high-fanout label
-- (object_id = 'concept:sveltekit', 14,171 of 539,124 rows) already
-- produces a native Bitmap Index Scan -> Bitmap Heap Scan
-- (feature_ontology_tuples_object_idx), 295ms cold / 29.5ms warm-cache, at
-- this table's actual current scale. Confirms the underlying mechanism this
-- view relies on already works on this data shape -- resolved_concept_id
-- has zero rows today so the real filtered view can't be EXPLAIN-tested
-- directly yet; this is the closest honest proxy available.
--
-- Purely additive. No existing table/column touched.

CREATE MATERIALIZED VIEW IF NOT EXISTS feature_ontology_tuples_fanout_v1 AS
SELECT
  id AS tuple_id,
  packet_key,
  source_ref,
  feature_key,
  subject_type,
  subject_id,
  predicate,
  object_type,
  object_id,
  resolved_concept_id,
  confidence,
  ontology_version,
  extractor_version,
  created_at
FROM feature_ontology_tuples
WHERE resolution_state = 'RESOLVED'
  AND resolved_concept_id IS NOT NULL
WITH NO DATA;

-- Required for REFRESH MATERIALIZED VIEW CONCURRENTLY (needs a unique index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_ontology_tuples_fanout_v1_tuple_id
  ON feature_ontology_tuples_fanout_v1 (tuple_id);

CREATE INDEX IF NOT EXISTS idx_feature_ontology_tuples_fanout_v1_concept_id
  ON feature_ontology_tuples_fanout_v1 (resolved_concept_id);

CREATE INDEX IF NOT EXISTS idx_feature_ontology_tuples_fanout_v1_subject_id
  ON feature_ontology_tuples_fanout_v1 (subject_id);

CREATE INDEX IF NOT EXISTS idx_feature_ontology_tuples_fanout_v1_packet_key
  ON feature_ontology_tuples_fanout_v1 (packet_key);

-- WITH NO DATA means the view is unpopulated until an explicit
-- REFRESH MATERIALIZED VIEW runs -- deliberate, since resolved_concept_id
-- has zero real rows yet (Phase 2 has no live writer, see tasks.md 3.1/3.4).
-- Refresh cadence (task 4.5): ON-DEMAND ONLY for this phase -- confirmed
-- live that pg_cron is not even an available extension on this instance
-- (SELECT * FROM pg_available_extensions WHERE name = 'pg_cron' -> 0 rows),
-- so an in-database schedule isn't an option without a new install, which
-- itself needs a separate DEPENDENCY-CAPABILITY-GUARD-01 justification.
-- REFRESH MATERIALIZED VIEW CONCURRENTLY feature_ontology_tuples_fanout_v1;
