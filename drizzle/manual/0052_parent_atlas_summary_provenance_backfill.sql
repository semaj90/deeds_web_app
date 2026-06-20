-- Truthful provenance for summaries created before phase17-21-summary-v1.
-- Do not invent the historical model or backend.

UPDATE public.parent_atlas_documents
SET
  summary_hash = COALESCE(summary_hash, encode(digest(summary, 'sha256'), 'hex')),
  summary_model = COALESCE(summary_model, 'legacy_unknown'),
  summary_backend = COALESCE(summary_backend, 'legacy_unknown'),
  summary_version = COALESCE(summary_version, 'legacy-pre-phase17-21'),
  summary_generated_at = COALESCE(summary_generated_at, updated_at, now()),
  summary_metadata = COALESCE(summary_metadata, '{}'::jsonb) || jsonb_build_object(
    'provenance', 'legacy_backfill',
    'canonical_model_known', false
  )
WHERE summary IS NOT NULL
  AND btrim(summary) <> ''
  AND (
    summary_hash IS NULL OR
    summary_model IS NULL OR
    summary_backend IS NULL OR
    summary_version IS NULL OR
    summary_generated_at IS NULL
  );
