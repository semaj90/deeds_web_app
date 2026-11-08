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
    canonical_authority BOOLEAN NOT NULL DEFAULT FALSE CHECK (canonical_authority = FALSE),
    CONSTRAINT atlas_kanban_dag_prefill_v1_no_synthetic_ordinal_chk
        CHECK (task_id !~ '^task:ordinal:' AND canonical_task_key !~ '^task:ordinal:'),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_canonical_key
    ON public.atlas_kanban_dag_prefill_v1 (canonical_task_key);

CREATE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_community_score
    ON public.atlas_kanban_dag_prefill_v1 (community_id, final_score DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_morton
    ON public.atlas_kanban_dag_prefill_v1 (morton_code);
