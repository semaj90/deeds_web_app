-- D19: output_meta JSONB column for research_summaries, embedded_summaries, codebase_chunk_index
-- D19: manifold4 float8[] for embedded_summaries (SOM + semantic 4D coords)

ALTER TABLE research_summaries
  ADD COLUMN IF NOT EXISTS output_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE embedded_summaries
  ADD COLUMN IF NOT EXISTS output_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS manifold4 float8[];

ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS output_meta jsonb NOT NULL DEFAULT '{}'::jsonb;