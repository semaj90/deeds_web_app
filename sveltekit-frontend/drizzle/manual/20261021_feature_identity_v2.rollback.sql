-- ROLLBACK for 20261021_feature_identity_v2.sql — DRAFT, NOT EXECUTED.
-- Refuses to drop any table that still has rows. Drop atlas_feature_labels first (it references the concepts).
BEGIN;
DO $$
DECLARE n bigint; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['atlas_feature_labels','atlas_feature_concept_crosswalk','atlas_feature_source_identities','atlas_feature_concepts'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
      IF n > 0 THEN RAISE EXCEPTION 'ROLLBACK_REFUSED: % has % rows', t, n; END IF;
    END IF;
  END LOOP;
END
$$;
DROP VIEW IF EXISTS atlas_feature_labels_current;
DROP VIEW IF EXISTS atlas_feature_concept_crosswalk_current;
DROP TABLE IF EXISTS atlas_feature_labels;
DROP TABLE IF EXISTS atlas_feature_concept_crosswalk;
DROP TABLE IF EXISTS atlas_feature_source_identities;
DROP TABLE IF EXISTS atlas_feature_concepts;
DROP FUNCTION IF EXISTS atlas_feature_identity_v2_touch_updated_at();
COMMIT;
