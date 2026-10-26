-- DRAFT — NOT APPLIED. For review only.
-- Purpose: create public.feature_registry, which the Drizzle schema declares
-- (src/lib/server/db/schema/feature-registry.ts) but PostgreSQL 18.4 legal_ai_db does not have
-- (postgres-contract-mirrors audit 2026-10-14: LIVE_TABLE_MISSING, 15 columns and 1 index).
--
-- Not included, on purpose:
--   * atlas_workspace_events, atlas_workspace_event_participants, atlas_workspace_heads.
--     Owner: drizzle/manual/20260916_workspace_event_head_v1.sql (planned_sidecar). That file
--     requires a migration-owner review and a disposable Postgres readback canary before apply.
--     Duplicating its DDL here would create a second owner.
--   * feature_tasks and agent_progress_log (same schema file; not reported by the audit).
--
-- All statements are additive and idempotent. No data is written.

BEGIN;

CREATE TABLE IF NOT EXISTS public.feature_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  status text NOT NULL,
  summary text,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  chunk_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  code_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  test_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  retry_queries jsonb NOT NULL DEFAULT '[]'::jsonb,
  cluster_id integer,
  trust_tier text,
  last_verified_at timestamptz DEFAULT now()
);

COMMIT;

-- Rollback (owner decision only; valid while the table is empty):
--   DROP TABLE IF EXISTS public.feature_registry;
