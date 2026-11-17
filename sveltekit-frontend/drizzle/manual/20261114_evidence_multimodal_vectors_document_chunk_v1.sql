-- Adds the 'document_chunk' modality to the EmbeddingGemma 2 evidence vector lane so evidence
-- text chunks live in the same 768-D space and table as image/audio/video vectors.
-- Additive: widens two CHECK constraints. No rows are rewritten.
-- Pre-image (2026-11-14): both tables created the same day by
--   20261113_evidence_multimodal_vectors_v1_DRAFT.sql, 0 rows each.
-- Post-check: both constraint definitions contain 'document_chunk'; row counts unchanged.
DO $$
BEGIN
  IF to_regclass('public.evidence_multimodal_vectors') IS NULL
     OR to_regclass('public.evidence_multimodal_vector_projection_outbox') IS NULL THEN
    RAISE EXCEPTION 'EVIDENCE_MULTIMODAL_TABLES_REQUIRED';
  END IF;
END $$;

ALTER TABLE public.evidence_multimodal_vectors
  DROP CONSTRAINT evidence_multimodal_vectors_modality_ck,
  ADD CONSTRAINT evidence_multimodal_vectors_modality_ck
    CHECK (modality IN ('image', 'video_frame', 'audio_segment', 'video_window', 'document_chunk'));

ALTER TABLE public.evidence_multimodal_vector_projection_outbox
  DROP CONSTRAINT evidence_multimodal_vector_outbox_modality_ck,
  ADD CONSTRAINT evidence_multimodal_vector_outbox_modality_ck
    CHECK (modality IN ('image', 'video_frame', 'audio_segment', 'video_window', 'document_chunk'));
