-- 20260601_research_summaries_source_refs.sql
-- Add canonical provenance fields for deep research summaries.
-- Idempotent and safe to run on live PostgreSQL 17/18.

ALTER TABLE public.research_summaries
  ADD COLUMN IF NOT EXISTS source_ref text;

ALTER TABLE public.research_summaries
  ADD COLUMN IF NOT EXISTS source_refs text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_research_summaries_source_ref
  ON public.research_summaries(source_ref);

CREATE INDEX IF NOT EXISTS idx_research_summaries_source_refs_gin
  ON public.research_summaries
  USING gin (source_refs);

CREATE INDEX IF NOT EXISTS idx_research_summaries_entity_tags_gin
  ON public.research_summaries
  USING gin (entity_tags);

CREATE INDEX IF NOT EXISTS idx_research_summaries_output_meta_gin
  ON public.research_summaries
  USING gin (output_meta jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_research_summaries_embedding_hnsw
  ON public.research_summaries
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_research_summaries_pipeline_score_id
  ON public.research_summaries(pipeline, relevance_score, id);

CREATE INDEX IF NOT EXISTS idx_research_summaries_entity_type_score
  ON public.research_summaries(entity_type, relevance_score, id);

CREATE INDEX IF NOT EXISTS idx_research_summaries_source_score
  ON public.research_summaries(source, relevance_score, id);

CREATE INDEX IF NOT EXISTS idx_research_summaries_user_created
  ON public.research_summaries(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_research_summaries_query_hash
  ON public.research_summaries(query_hash);
