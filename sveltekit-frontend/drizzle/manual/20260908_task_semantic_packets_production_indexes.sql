-- Production-readiness index candidate for task_semantic_packets.
-- Unapplied: requires 20260908_task_semantic_packets_writer_columns_only.sql first.
-- No table creation, backfill, delete, rewrite, or data mutation is performed here.

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_workspace_task_created
  ON public.task_semantic_packets (workspace_task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_status_feature
  ON public.task_semantic_packets (status, feature_id);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_agent_pickup_ready
  ON public.task_semantic_packets (agent_pickup_ready);
