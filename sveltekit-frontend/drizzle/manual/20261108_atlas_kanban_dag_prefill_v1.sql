-- Candidate Sidecar Migration: 20261108_atlas_kanban_dag_prefill_v1.sql
-- Status: active_candidate (NOT APPLIED to live legal_ai_db without explicit operator approval)
-- Authority Boundary:
--   public.kanban_tasks + public.kanban_task_dependencies + public.kanban_task_events + public.kanban_task_attempts
--   remain the canonical operational task-board tables.
--   atlas_kanban_dag_prefill_v1 is a non-canonical routing/prefill projection over the 6,527-task binary cohort,
--   keyed by canonical_task_key (<change>#<16-hex-sha256>) and never by synthetic task:ordinal:<n> IDs.

CREATE TABLE IF NOT EXISTS public.atlas_kanban_dag_prefill_v1 (
    task_id             TEXT PRIMARY KEY,
    canonical_task_key  TEXT NOT NULL,
    cohort_ordinal      INTEGER NOT NULL CHECK (cohort_ordinal >= 0),
    change_id           TEXT NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('UNVERIFIED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED')),
    routing_status      TEXT NOT NULL CHECK (routing_status IN ('ROUTED_ACTIVE', 'UNROUTED')),
    community_id        INTEGER NOT NULL,
    domain_id           SMALLINT NOT NULL,
    morton_code         BIGINT NOT NULL,
    priority_score      REAL NOT NULL,
    final_score         REAL NOT NULL,
    routing_active_bit  BOOLEAN NOT NULL,
    umap_xyz            REAL[3] NOT NULL,
    rot_6d              REAL[6] NOT NULL,
    latent_64d          REAL[64],
    cohort_revision          TEXT,
    source_revision          TEXT,
    source_sha256            TEXT,
    workspace_revision       TEXT,
    representation_family    TEXT,
    representation_revision  TEXT,
    embedding_model_digest   TEXT,
    vector_artifact_ref      TEXT,
    vector_artifact_sha256   TEXT,
    fusion_packet_schema     TEXT,
    fusion_packet_sha256     TEXT,
    nes_palette_checksum     TEXT,
    glyph_schema             TEXT,
    glyph_instance64         BYTEA,
    canonical_authority BOOLEAN NOT NULL DEFAULT FALSE CHECK (canonical_authority = FALSE),
    CONSTRAINT atlas_kanban_dag_prefill_v1_no_synthetic_ordinal_chk
        CHECK (task_id !~ '^task:ordinal:' AND canonical_task_key !~ '^task:ordinal:'),
    CONSTRAINT atlas_kanban_dag_prefill_v1_array_shape_chk
        CHECK (array_length(umap_xyz, 1) = 3 AND array_length(rot_6d, 1) = 6
               AND (latent_64d IS NULL OR array_length(latent_64d, 1) = 64)),
    CONSTRAINT atlas_kanban_dag_prefill_v1_provenance_format_chk
        CHECK ((source_sha256 IS NULL OR source_sha256 ~ '^sha256:[0-9a-f]{64}$')
               AND (vector_artifact_sha256 IS NULL OR vector_artifact_sha256 ~ '^sha256:[0-9a-f]{64}$')
               AND (fusion_packet_sha256 IS NULL OR fusion_packet_sha256 ~ '^sha256:[0-9a-f]{64}$')
               AND (workspace_revision IS NULL OR workspace_revision ~ '^sha256:[0-9a-f]{64}$')
               AND (glyph_instance64 IS NULL OR octet_length(glyph_instance64) = 64)),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_canonical_key
    ON public.atlas_kanban_dag_prefill_v1 (canonical_task_key);

CREATE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_community_score
    ON public.atlas_kanban_dag_prefill_v1 (community_id, final_score DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_morton
    ON public.atlas_kanban_dag_prefill_v1 (morton_code);

CREATE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_cohort
    ON public.atlas_kanban_dag_prefill_v1 (cohort_revision, cohort_ordinal);

-- Provenance columns are nullable and non-canonical. A table created before 2026-11-08 upgrades with
-- 20261108_atlas_kanban_dag_prefill_v1_provenance_DRAFT.sql (additive ALTER); keep both aligned.
