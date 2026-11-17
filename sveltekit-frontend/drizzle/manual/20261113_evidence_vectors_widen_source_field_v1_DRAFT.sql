-- sveltekit-frontend/drizzle/manual/20261113_evidence_vectors_widen_source_field_v1_DRAFT.sql
-- DRAFT MIGRATION ONLY — NOT APPLIED TO ANY DATABASE.
-- Widens public.evidence_vectors_source_field_ck in scratch only so V2 markup revision text
-- can be indexed as 'evidence_markup_revision_text' alongside 'canonical_evidence_text'.

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'legal_ai_live_integration_scratch' THEN
        RAISE EXCEPTION 'SCRATCH_ONLY_MIGRATION_GUARD: 20261113_evidence_vectors_widen_source_field_v1_DRAFT.sql may only run on legal_ai_live_integration_scratch';
    END IF;

    IF to_regclass('public.evidence_vectors') IS NULL THEN
        RAISE EXCEPTION 'public.evidence_vectors is missing';
    END IF;
END
$$;

ALTER TABLE public.evidence_vectors
    DROP CONSTRAINT IF EXISTS evidence_vectors_source_field_ck,
    ADD CONSTRAINT evidence_vectors_source_field_ck
        CHECK (source_field IN ('canonical_evidence_text', 'evidence_markup_revision_text'));

COMMIT;
