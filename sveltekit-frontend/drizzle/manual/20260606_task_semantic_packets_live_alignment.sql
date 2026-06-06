-- 20260606_task_semantic_packets_live_alignment.sql
-- Additive mirror sidecar for task_semantic_packets live contract alignment.
-- This file is intentionally idempotent and duplicate-safe with IF NOT EXISTS.
-- No data migration, no destructive changes, no index churn.

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS centroid_id text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS cluster_id text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS file_path text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS next_action text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS observed_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS parent_centroid_id text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS point_kind text DEFAULT 'task_summary' NOT NULL;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS related_feature_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS related_file_paths jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS related_task_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS semantic_path jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS source_ref text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS summary_llm text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS valid_to timestamptz;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS workspace_id text;

-- Indexes already exist in the canonical mirror sidecar:
--   drizzle/manual/20260601_task_semantic_packets_v2.sql
-- Intentionally omitted here to avoid redundant index churn.
