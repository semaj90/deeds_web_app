-- 20260601_research_summaries_source_refs_backfill.sql
-- Backfill provenance anchors for existing research_summaries rows.
-- Safe/idempotent: only fills rows that already have a URL and no source_ref.

UPDATE public.research_summaries
SET
  source_ref  = COALESCE(source_ref, url),
  source_refs = CASE
    WHEN COALESCE(array_length(source_refs, 1), 0) = 0 AND url IS NOT NULL THEN ARRAY[url]
    ELSE source_refs
  END
WHERE url IS NOT NULL
  AND (source_ref IS NULL OR COALESCE(array_length(source_refs, 1), 0) = 0);

