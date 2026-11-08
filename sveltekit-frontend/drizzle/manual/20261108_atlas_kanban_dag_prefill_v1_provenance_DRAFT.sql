-- DRAFT / REHEARSAL ONLY. Target: legal_ai_live_integration_scratch (scratch). NOT applied to legal_ai_db.
-- Extends atlas_kanban_dag_prefill_v1 (owner: 20261108_atlas_kanban_dag_prefill_v1.sql). Do NOT create a parallel table.
-- All new columns are nullable: 6,527 existing rows have no provenance and must not get coerced values.
-- Pre-image (scratch, 2026-11-08): 17 columns, 6,527 rows, 4 indexes (pkey, canonical_key, community_score, morton), no array-shape checks.
-- Never store: the 768-D tensor, RNN recurrent state, or a packed quantization matrix in this table.
-- Execution: docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_live_integration_scratch -v ON_ERROR_STOP=1 < this file
BEGIN;

ALTER TABLE public.atlas_kanban_dag_prefill_v1
    ADD COLUMN IF NOT EXISTS cohort_revision          TEXT,
    ADD COLUMN IF NOT EXISTS source_revision          TEXT,
    ADD COLUMN IF NOT EXISTS source_sha256            TEXT,
    ADD COLUMN IF NOT EXISTS workspace_revision       TEXT,   -- admitted sha256 only; NULL until admission, never a rev:* label
    ADD COLUMN IF NOT EXISTS representation_family    TEXT,   -- e.g. EMBEDDINGGEMMA_PREFIX64_EXPERIMENTAL
    ADD COLUMN IF NOT EXISTS representation_revision  TEXT,
    ADD COLUMN IF NOT EXISTS embedding_model_digest   TEXT,
    ADD COLUMN IF NOT EXISTS vector_artifact_ref      TEXT,
    ADD COLUMN IF NOT EXISTS vector_artifact_sha256   TEXT,
    ADD COLUMN IF NOT EXISTS fusion_packet_schema     TEXT,
    ADD COLUMN IF NOT EXISTS fusion_packet_sha256     TEXT,
    ADD COLUMN IF NOT EXISTS nes_palette_checksum     TEXT,
    ADD COLUMN IF NOT EXISTS glyph_schema             TEXT,
    ADD COLUMN IF NOT EXISTS glyph_instance64         BYTEA;

-- Shape checks (PostgreSQL does not enforce declared REAL[n] lengths).
ALTER TABLE public.atlas_kanban_dag_prefill_v1
    ADD CONSTRAINT atlas_kanban_dag_prefill_v1_array_shape_chk CHECK (
        array_length(umap_xyz, 1) = 3
        AND array_length(rot_6d, 1) = 6
        AND (latent_64d IS NULL OR array_length(latent_64d, 1) = 64)
    ),
    ADD CONSTRAINT atlas_kanban_dag_prefill_v1_provenance_format_chk CHECK (
        (source_sha256          IS NULL OR source_sha256          ~ '^sha256:[0-9a-f]{64}$')
        AND (vector_artifact_sha256 IS NULL OR vector_artifact_sha256 ~ '^sha256:[0-9a-f]{64}$')
        AND (fusion_packet_sha256   IS NULL OR fusion_packet_sha256   ~ '^sha256:[0-9a-f]{64}$')
        AND (workspace_revision     IS NULL OR workspace_revision     ~ '^sha256:[0-9a-f]{64}$')
        AND (glyph_instance64       IS NULL OR octet_length(glyph_instance64) = 64)
    );

CREATE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_cohort
    ON public.atlas_kanban_dag_prefill_v1 (cohort_revision, cohort_ordinal);

-- Post-checks (rehearsal): expected 31 columns, 6527 rows unchanged, new index present, all new provenance columns NULL.
SELECT 'columns'  AS check, count(*)::text AS value FROM information_schema.columns WHERE table_name = 'atlas_kanban_dag_prefill_v1'
UNION ALL SELECT 'rows', count(*)::text FROM public.atlas_kanban_dag_prefill_v1
UNION ALL SELECT 'cohort_index', count(*)::text FROM pg_indexes WHERE indexname = 'idx_atlas_kanban_dag_prefill_v1_cohort'
UNION ALL SELECT 'rows_with_any_provenance', count(*)::text FROM public.atlas_kanban_dag_prefill_v1
    WHERE cohort_revision IS NOT NULL OR source_revision IS NOT NULL OR vector_artifact_sha256 IS NOT NULL OR glyph_instance64 IS NOT NULL;

ROLLBACK;  -- rehearsal. Replace with COMMIT only after explicit approval and a recorded pre-image.
