-- file_summaries: per-file summary + chunk mapping table
-- Feeds from graphify:cluster-summaries, maps chunk_ids → file_path → summary_md
-- Used by: adaptive planning, GraphRAG manifold4 propagation, KB ingestion pipeline

CREATE TABLE IF NOT EXISTS file_summaries (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path     text          NOT NULL,
  summary_md    text,
  chunk_ids     text[]        NOT NULL DEFAULT '{}',
  manifold4     real[],                              -- [som_x, som_y, semantic_z, grpo_w]
  cluster_id    integer,
  tags          text[]        NOT NULL DEFAULT '{}',
  trust_tier    smallint      NOT NULL DEFAULT 3,    -- T3 = committed code (×0.95)
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (file_path)
);

CREATE INDEX IF NOT EXISTS idx_file_summaries_cluster   ON file_summaries (cluster_id);
CREATE INDEX IF NOT EXISTS idx_file_summaries_tags      ON file_summaries USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_file_summaries_manifold4 ON file_summaries USING GIN (manifold4);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION update_file_summaries_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_file_summaries_updated_at ON file_summaries;
CREATE TRIGGER trg_file_summaries_updated_at
  BEFORE UPDATE ON file_summaries
  FOR EACH ROW EXECUTE FUNCTION update_file_summaries_updated_at();