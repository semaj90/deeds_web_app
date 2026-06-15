-- 20260606_task_semantic_packets_live_alignment.sql
-- Additive mirror sidecar for task_semantic_packets live contract alignment.
-- This file is intentionally idempotent and duplicate-safe with IF NOT EXISTS.
-- No data migration, no destructive changes, no index churn.

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS centroid_id text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS cluster_id text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS packet_key text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS feature_label text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS file_path text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS community_id integer;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS community_source text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS community_confidence numeric;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS canonical_source_ref text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS source_ref_hash text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS workspace_task_id integer;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS next_action text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS observed_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS parent_centroid_id text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS summary text;

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
  ADD COLUMN IF NOT EXISTS canonical_source_ref text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS source_ref_hash text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS summary_llm text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS qdrant_point_id text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS valid_to timestamptz;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS lineage_version text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS ledger_type text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS canonical boolean NOT NULL DEFAULT false;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS payload_backfilled_at timestamptz;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS domain_class text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS som_row integer;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS som_col integer;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS som_index integer;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS kmeans_cluster integer;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS workspace_id text;

CREATE INDEX IF NOT EXISTS tsp_source_ref_hash_idx
  ON public.task_semantic_packets (source_ref_hash);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_packet_key_idx
  ON public.task_semantic_packets (packet_key);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_feature_label_idx
  ON public.task_semantic_packets (feature_label);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_community_id_idx
  ON public.task_semantic_packets (community_id);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_community_source_idx
  ON public.task_semantic_packets (community_source);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_community_confidence_idx
  ON public.task_semantic_packets (community_confidence);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_metadata_gin
  ON public.task_semantic_packets USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_tags_gin
  ON public.task_semantic_packets USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_lineage_version_idx
  ON public.task_semantic_packets (lineage_version);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_ledger_type_idx
  ON public.task_semantic_packets (ledger_type);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_domain_class_idx
  ON public.task_semantic_packets (domain_class);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_som_row_idx
  ON public.task_semantic_packets (som_row);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_som_col_idx
  ON public.task_semantic_packets (som_col);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_som_index_idx
  ON public.task_semantic_packets (som_index);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_kmeans_cluster_idx
  ON public.task_semantic_packets (kmeans_cluster);

-- Indexes already exist in the canonical mirror sidecar:
--   drizzle/manual/20260601_task_semantic_packets_v2.sql
-- Intentionally omitted here to avoid redundant index churn.
