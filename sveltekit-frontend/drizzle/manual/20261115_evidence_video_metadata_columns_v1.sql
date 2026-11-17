-- Additive video metadata columns on the canonical evidence table (task: video metadata visibility).
-- Adds four nullable columns. No rows are rewritten, no defaults, no constraints beyond types.
-- Pre-image (2026-11-15): none of these columns exists on public.evidence; values for existing videos
-- remain in ai_analysis->'videoAnalysis'->'probe' and are not backfilled by this migration.
-- Post-check: exactly four columns added; row count unchanged.
-- Apply: manual psql only, after a rehearsal in legal_ai_live_integration_scratch rolled back.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.evidence') IS NULL THEN
    RAISE EXCEPTION 'EVIDENCE_VIDEO_METADATA_REQUIRES_EVIDENCE_TABLE';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='evidence'
             AND column_name IN ('video_codec','audio_codec','duration_seconds','frame_count')) THEN
    RAISE EXCEPTION 'EVIDENCE_VIDEO_METADATA_ALREADY_PRESENT';
  END IF;
END $$;

ALTER TABLE public.evidence
  ADD COLUMN video_codec text,
  ADD COLUMN audio_codec text,
  ADD COLUMN duration_seconds numeric(12,3),
  ADD COLUMN frame_count integer;

DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='evidence'
      AND column_name IN ('video_codec','audio_codec','duration_seconds','frame_count')) <> 4 THEN
    RAISE EXCEPTION 'EVIDENCE_VIDEO_METADATA_POSTCHECK_COLUMNS';
  END IF;
END $$;

COMMIT;
