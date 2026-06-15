-- 20260601_task_semantic_packets_v2.sql
-- Task Semantic Packet mirror expansion for Kanban → Qdrant → Postgres → OpenCode/Gemma4 pickup.
-- Safe to run idempotently.

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS point_kind text DEFAULT 'task_summary' NOT NULL;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS workspace_id text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS source_ref text;

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
  ADD COLUMN IF NOT EXISTS semantic_path jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS related_feature_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS related_task_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS related_file_paths jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS cluster_id text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS centroid_id text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS parent_centroid_id text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS summary text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS summary_llm text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS next_action text;

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS observed_at timestamptz NOT NULL DEFAULT now();

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

ALTER TABLE public.agent_pickup_queue
  ADD COLUMN IF NOT EXISTS lane text NOT NULL DEFAULT 'semantic_packet';

CREATE TABLE IF NOT EXISTS public.task_cluster_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_task_id integer NOT NULL,
  feature_id text,
  qdrant_point_id text NOT NULL,
  cluster_id text,
  centroid_id text,
  relation_kind text NOT NULL DEFAULT 'related',
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_cluster_links_task_id
  ON public.task_cluster_links (workspace_task_id);

CREATE INDEX IF NOT EXISTS idx_task_cluster_links_feature_id
  ON public.task_cluster_links (feature_id);

CREATE INDEX IF NOT EXISTS idx_task_cluster_links_cluster_id
  ON public.task_cluster_links (cluster_id);

CREATE INDEX IF NOT EXISTS idx_task_cluster_links_centroid_id
  ON public.task_cluster_links (centroid_id);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_workspace_id
  ON public.task_semantic_packets (workspace_id);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_point_kind
  ON public.task_semantic_packets (point_kind);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_feature_id
  ON public.task_semantic_packets (feature_id);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_feature_id_idx
  ON public.task_semantic_packets (feature_id);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_source_ref
  ON public.task_semantic_packets (source_ref);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_source_ref_idx
  ON public.task_semantic_packets (source_ref);

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

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_cluster_id
  ON public.task_semantic_packets (cluster_id);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_centroid_id
  ON public.task_semantic_packets (centroid_id);

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

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_semantic_path_gin
  ON public.task_semantic_packets
  USING gin (semantic_path);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_related_feature_ids_gin
  ON public.task_semantic_packets
  USING gin (related_feature_ids);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_related_task_ids_gin
  ON public.task_semantic_packets
  USING gin (related_task_ids);

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_related_file_paths_gin
  ON public.task_semantic_packets
  USING gin (related_file_paths);
