-- 20260602_superseded_score_validation.sql
-- Read-only validation for the superseded-score lane.
-- This file is safe to run as-is. It never mutates data.

WITH table_info AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'parent_atlas_documents'
    ) AS parent_atlas_documents_exists
), column_info AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'parent_atlas_documents'
        AND column_name = 'superseded_score'
    ) AS superseded_score_exists,
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'parent_atlas_documents'
        AND column_name = 'archive_eligible'
    ) AS archive_eligible_exists,
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'parent_atlas_documents'
        AND column_name = 'archive_decision'
    ) AS archive_decision_exists
)
SELECT
  t.parent_atlas_documents_exists,
  c.superseded_score_exists,
  c.archive_eligible_exists,
  c.archive_decision_exists
FROM table_info t
CROSS JOIN column_info c;

SELECT
  COUNT(*) AS row_count,
  COUNT(*) FILTER (WHERE superseded_score IS NOT NULL) AS scored_rows,
  MIN(superseded_score) AS min_score,
  MAX(superseded_score) AS max_score,
  ROUND(AVG(superseded_score)::numeric, 2) AS avg_score
FROM public.parent_atlas_documents
WHERE EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'parent_atlas_documents'
    AND column_name = 'superseded_score'
);

SELECT
  superseded_score,
  COUNT(*) AS rows_at_score
FROM public.parent_atlas_documents
WHERE EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'parent_atlas_documents'
    AND column_name = 'superseded_score'
)
GROUP BY superseded_score
ORDER BY superseded_score DESC;

SELECT
  source_ref,
  feature_id,
  superseded_score,
  archive_eligible,
  archive_decision
FROM public.parent_atlas_documents
WHERE EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'parent_atlas_documents'
    AND column_name = 'superseded_score'
)
ORDER BY COALESCE(superseded_score, -1) DESC, updated_at DESC
LIMIT 25;
