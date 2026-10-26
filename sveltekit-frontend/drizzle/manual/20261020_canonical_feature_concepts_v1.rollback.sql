-- ROLLBACK for 20261020_canonical_feature_concepts_v1.sql — DRAFT, NOT EXECUTED.
-- Refuses to drop any table that still has rows, so no identity or crosswalk history is lost.
-- Drop atlas_feature_labels (its rollback) before this file, because labels reference the concepts.
BEGIN;
DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.atlas_feature_crosswalk') IS NOT NULL THEN
    SELECT count(*) INTO n FROM atlas_feature_crosswalk;
    IF n > 0 THEN RAISE EXCEPTION 'ROLLBACK_REFUSED: atlas_feature_crosswalk has % rows', n; END IF;
  END IF;
  IF to_regclass('public.canonical_feature_concepts') IS NOT NULL THEN
    SELECT count(*) INTO n FROM canonical_feature_concepts;
    IF n > 0 THEN RAISE EXCEPTION 'ROLLBACK_REFUSED: canonical_feature_concepts has % rows', n; END IF;
  END IF;
END
$$;
DROP VIEW IF EXISTS atlas_feature_crosswalk_current;
DROP TRIGGER IF EXISTS atlas_feature_crosswalk_touch ON atlas_feature_crosswalk;
DROP TRIGGER IF EXISTS canonical_feature_concepts_touch ON canonical_feature_concepts;
DROP TABLE IF EXISTS atlas_feature_crosswalk;
DROP TABLE IF EXISTS canonical_feature_concepts;
DROP FUNCTION IF EXISTS atlas_feature_identity_touch_updated_at();
COMMIT;
