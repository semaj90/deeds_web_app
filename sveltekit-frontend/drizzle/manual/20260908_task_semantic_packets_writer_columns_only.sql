-- 20260908_task_semantic_packets_writer_columns_only.sql
-- Minimal additive prerequisite for the active MCP/API task-packet writer.
-- No indexes, backfill, projection, or legacy enrichment columns are included.
-- Apply only through the reviewed Drizzle migration path after authorization.

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS point_kind text NOT NULL DEFAULT 'task_summary',
  ADD COLUMN IF NOT EXISTS qdrant_point_id text,
  ADD COLUMN IF NOT EXISTS workspace_id text,
  ADD COLUMN IF NOT EXISTS workspace_task_id integer,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS semantic_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_feature_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_task_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_file_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cluster_id text,
  ADD COLUMN IF NOT EXISTS centroid_id text,
  ADD COLUMN IF NOT EXISTS parent_centroid_id text,
  ADD COLUMN IF NOT EXISTS summary_llm text,
  ADD COLUMN IF NOT EXISTS summary_model text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS summary_hash text,
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'todo',
  ADD COLUMN IF NOT EXISTS agent_pickup_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS observed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_to timestamptz,
  ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
