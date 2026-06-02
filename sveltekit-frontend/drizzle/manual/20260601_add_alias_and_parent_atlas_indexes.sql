-- 20260601_add_alias_and_parent_atlas_indexes.sql
-- SAFE ADDITIVE ONLY. All statements are IF NOT EXISTS / idempotent.
-- PostgreSQL 18.x compatible. No DROPs. No table recreation. No PK changes.
--
-- Apply when schema preflight is green:
--   docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < \
--     sveltekit-frontend/drizzle/manual/20260601_add_alias_and_parent_atlas_indexes.sql

-- ── task_semantic_packets ──────────────────────────────────────────────────

-- alias_id column (already present in live as of 2026-06-01 audit, idempotent)
ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS alias_id text;

-- missing indexes on task_semantic_packets (complement to existing idx_*)
CREATE INDEX IF NOT EXISTS task_semantic_packets_alias_id_idx
  ON public.task_semantic_packets (alias_id);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_qdrant_point_id
  ON public.task_semantic_packets (qdrant_point_id);

-- ── parent_atlas_documents (create if missing) ─────────────────────────────
-- This table does NOT exist in live as of the 2026-06-01 audit.
-- Create it here so promotion scripts can upsert into it.

CREATE TABLE IF NOT EXISTS public.parent_atlas_documents (
  id               bigserial PRIMARY KEY,
  source_ref       text        NOT NULL,
  feature_id       text,
  workspace_id     text,
  rel_path         text,
  file_ext         text,
  tags             text[],
  summary          text,
  line_count       integer,
  is_route         boolean     DEFAULT false,
  is_svelte_comp   boolean     DEFAULT false,
  has_auth         boolean     DEFAULT false,
  has_zod          boolean     DEFAULT false,
  drizzle_refs     jsonb,
  imports          jsonb,
  exports          jsonb,
  route_handlers   jsonb,
  payload          jsonb,
  cluster_id       text,
  centroid_id      text,
  qdrant_point_id  text,
  alias_id         text,
  ingest_source    text        NOT NULL DEFAULT 'codebase-graph',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parent_atlas_documents_source_ref_workspace_uq UNIQUE (source_ref, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_pad_source_ref
  ON public.parent_atlas_documents (source_ref);

CREATE INDEX IF NOT EXISTS idx_pad_feature_id
  ON public.parent_atlas_documents (feature_id);

CREATE INDEX IF NOT EXISTS idx_pad_workspace_id
  ON public.parent_atlas_documents (workspace_id);

CREATE INDEX IF NOT EXISTS idx_pad_cluster_id
  ON public.parent_atlas_documents (cluster_id);

CREATE INDEX IF NOT EXISTS idx_pad_alias_id
  ON public.parent_atlas_documents (alias_id);

CREATE INDEX IF NOT EXISTS idx_pad_qdrant_point_id
  ON public.parent_atlas_documents (qdrant_point_id);

CREATE INDEX IF NOT EXISTS idx_pad_tags_gin
  ON public.parent_atlas_documents USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_pad_payload_gin
  ON public.parent_atlas_documents USING gin (payload jsonb_path_ops);

-- ── Verify ─────────────────────────────────────────────────────────────────
-- After running, confirm with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name='parent_atlas_documents';
