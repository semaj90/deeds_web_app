-- 20260601_task_semantic_packets_alias_id_and_atlas_profile_gin.sql
-- Postgres 18-friendly sidecar for alias routing and atlas/profile search.
-- Safe to run idempotently.

ALTER TABLE public.task_semantic_packets
  ADD COLUMN IF NOT EXISTS alias_id text;

CREATE INDEX IF NOT EXISTS task_semantic_packets_alias_id_idx
  ON public.task_semantic_packets(alias_id);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_profiles_metadata_gin
  ON public.atlas_feature_profiles
  USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_atlas_dependency_edges_metadata_gin
  ON public.atlas_dependency_edges
  USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_atlas_hot_keyword_clusters_feature_labels_gin
  ON public.atlas_hot_keyword_clusters
  USING gin (feature_labels);

CREATE INDEX IF NOT EXISTS idx_atlas_hot_keyword_clusters_top_source_refs_gin
  ON public.atlas_hot_keyword_clusters
  USING gin (top_source_refs);

CREATE INDEX IF NOT EXISTS idx_atlas_retrieval_events_source_refs_gin
  ON public.atlas_retrieval_events
  USING gin (source_refs);
