-- DRAFT ONLY -- DO NOT APPLY.
-- WORKSPACE-EVENT-BRIDGE-01 persistence draft (openspec: parent-atlas-temporal-retrieval-context-fabric, TRCF-21).
-- Not validated against a live server. Requires: migration-owner review, then a
-- rollback-first canary: BEGIN; <base sidecar>; <this file>; <readback checks>; ROLLBACK;
-- (PostgreSQL DDL is transactional, so the canary leaves nothing behind.)
-- Applies AFTER 20260916_workspace_event_head_v1.sql. Additive only: no DROP, no data rewrite.
-- Mirrors WorkspaceEventProvenanceV1 (identity-bearing, in the event checksum) and keeps
-- WorkspaceEventObservationV1 (recordedAt/tool/approval) OUT of the immutable event row.

-- 1. Identity-bearing provenance on the immutable event row (all-or-none).
ALTER TABLE public.atlas_workspace_events
  ADD COLUMN IF NOT EXISTS task_id text,
  ADD COLUMN IF NOT EXISTS execution_run_id text,
  ADD COLUMN IF NOT EXISTS lease_id uuid,
  ADD COLUMN IF NOT EXISTS lease_fence_token text,
  ADD COLUMN IF NOT EXISTS lease_fence_epoch bigint CHECK (lease_fence_epoch IS NULL OR lease_fence_epoch > 0),
  ADD COLUMN IF NOT EXISTS worktree_id text,
  ADD COLUMN IF NOT EXISTS branch text,
  ADD COLUMN IF NOT EXISTS base_commit text,
  ADD COLUMN IF NOT EXISTS actor text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS supersedes_event_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atlas_workspace_events_provenance_all_or_none') THEN
    ALTER TABLE public.atlas_workspace_events
      ADD CONSTRAINT atlas_workspace_events_provenance_all_or_none CHECK (
        (task_id IS NULL AND execution_run_id IS NULL AND lease_id IS NULL AND lease_fence_token IS NULL
          AND lease_fence_epoch IS NULL AND worktree_id IS NULL AND branch IS NULL AND base_commit IS NULL AND actor IS NULL
          AND idempotency_key IS NULL)
        OR
        (task_id IS NOT NULL AND execution_run_id IS NOT NULL AND lease_id IS NOT NULL AND lease_fence_token IS NOT NULL
          AND lease_fence_epoch IS NOT NULL AND worktree_id IS NOT NULL AND branch IS NOT NULL AND base_commit IS NOT NULL AND actor IS NOT NULL
          AND idempotency_key IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atlas_workspace_events_supersedes_fkey') THEN
    ALTER TABLE public.atlas_workspace_events
      ADD CONSTRAINT atlas_workspace_events_supersedes_fkey
      FOREIGN KEY (supersedes_event_id) REFERENCES public.atlas_workspace_events(event_id);
  END IF;
END
$$;

-- Same idempotency key inside one worktree stream can never produce a second, different event.
CREATE UNIQUE INDEX IF NOT EXISTS atlas_workspace_events_idempotency_uidx
  ON public.atlas_workspace_events (workspace_id, worktree_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_workspace_events_task_idx
  ON public.atlas_workspace_events (task_id, workspace_id, sequence)
  WHERE task_id IS NOT NULL;

-- 2. Append-only observations. Approval changes after an event exists, so it must not
--    live on the immutable event row. Latest row per event_id is the current state.
--    recorded_at is DB-assigned: the ledger-receipt time, not a client claim.
CREATE TABLE IF NOT EXISTS public.atlas_workspace_event_observations (
  observation_id bigserial PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.atlas_workspace_events(event_id),
  approval text NOT NULL DEFAULT 'PENDING' CHECK (approval IN ('PENDING', 'APPROVED', 'REJECTED')),
  tool text,
  client_recorded_at timestamptz,
  decided_by text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_workspace_event_observations_event_idx
  ON public.atlas_workspace_event_observations (event_id, observation_id DESC);

DROP TRIGGER IF EXISTS atlas_workspace_event_observations_immutable_v1 ON public.atlas_workspace_event_observations;
CREATE TRIGGER atlas_workspace_event_observations_immutable_v1
  BEFORE UPDATE OR DELETE ON public.atlas_workspace_event_observations
  FOR EACH ROW EXECUTE FUNCTION public.atlas_workspace_event_immutable_v1();

-- 3. Worktree leases: mirrors src/lib/server/db/schema/worktree-leases.ts exactly.
--    No SQL for this table existed anywhere in the repo. fence_epoch is a monotonic integer
--    incremented on every grant/reclaim (JOURNAL-06 decision, operator-directed 2026-10-17):
--    presented < current proves a stale/zombie holder without re-reading the lease row.
CREATE TABLE IF NOT EXISTS public.worktree_leases (
  lease_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL,
  run_id text,
  owner_agent text NOT NULL,
  repository_root text NOT NULL,
  worktree_path text NOT NULL,
  branch_name text NOT NULL,
  base_commit text NOT NULL,
  allowed_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  forbidden_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ALLOCATED' CHECK (status IN (
    'ALLOCATED', 'ACTIVE', 'VALIDATING', 'READY_FOR_REVIEW', 'BLOCKED', 'RELEASED', 'ARCHIVED'
  )),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  released_at timestamptz,
  fence_epoch bigint NOT NULL DEFAULT 1 CHECK (fence_epoch > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS worktree_leases_task_idx ON public.worktree_leases (task_id);
CREATE INDEX IF NOT EXISTS worktree_leases_run_idx ON public.worktree_leases (run_id);
CREATE INDEX IF NOT EXISTS worktree_leases_owner_idx ON public.worktree_leases (owner_agent, status);
CREATE INDEX IF NOT EXISTS worktree_leases_branch_idx ON public.worktree_leases (branch_name);
CREATE UNIQUE INDEX IF NOT EXISTS worktree_leases_path_unique_idx
  ON public.worktree_leases (repository_root, worktree_path)
  WHERE status IN ('ALLOCATED', 'ACTIVE', 'VALIDATING', 'READY_FOR_REVIEW');

-- Rollback (new objects only; no pre-existing data is touched):
--   DROP TABLE IF EXISTS public.worktree_leases;
--   DROP TABLE IF EXISTS public.atlas_workspace_event_observations;
--   DROP INDEX IF EXISTS public.atlas_workspace_events_task_idx, public.atlas_workspace_events_idempotency_uidx;
--   ALTER TABLE public.atlas_workspace_events DROP CONSTRAINT IF EXISTS atlas_workspace_events_supersedes_fkey,
--     DROP CONSTRAINT IF EXISTS atlas_workspace_events_provenance_all_or_none,
--     DROP COLUMN IF EXISTS task_id, DROP COLUMN IF EXISTS execution_run_id, DROP COLUMN IF EXISTS lease_id,
--     DROP COLUMN IF EXISTS lease_fence_token, DROP COLUMN IF EXISTS lease_fence_epoch, DROP COLUMN IF EXISTS worktree_id, DROP COLUMN IF EXISTS branch,
--     DROP COLUMN IF EXISTS base_commit, DROP COLUMN IF EXISTS actor, DROP COLUMN IF EXISTS idempotency_key,
--     DROP COLUMN IF EXISTS supersedes_event_id;
