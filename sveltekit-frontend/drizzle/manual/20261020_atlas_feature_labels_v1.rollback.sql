-- ROLLBACK for 20261020_atlas_feature_labels_v1.sql — DRAFT, NOT EXECUTED.
--
-- Run only if the forward migration was applied and must be reverted, and only with an explicit
-- operator authorization. Refuses to drop the table if any row exists, so no label history is lost
-- by accident. Archive rows first (see the archive rule in CLAUDE.md) if any exist.

BEGIN;

DO $$
DECLARE
  n bigint;
BEGIN
  IF to_regclass('public.atlas_feature_labels') IS NULL THEN
    RAISE NOTICE 'atlas_feature_labels does not exist; nothing to roll back';
    RETURN;
  END IF;
  SELECT count(*) INTO n FROM atlas_feature_labels;
  IF n > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_REFUSED: atlas_feature_labels has % rows; archive them before rollback', n;
  END IF;
END
$$;

DROP VIEW IF EXISTS atlas_feature_labels_current;
DROP TRIGGER IF EXISTS atlas_feature_labels_touch ON atlas_feature_labels;
DROP FUNCTION IF EXISTS atlas_feature_labels_touch_updated_at();
DROP TABLE IF EXISTS atlas_feature_labels;

COMMIT;
