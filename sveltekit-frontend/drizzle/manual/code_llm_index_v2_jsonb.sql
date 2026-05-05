-- code_llm_index v2: add JSONB structured-summary column for analytics + RAG/KAG/DAG hooks.
--
-- Why JSONB:
--   - Stores the structured 1-3 sentence summary alongside raw llm_output text
--   - simdjson AVX2 read path can decode it at 2-5× V8 speed when ACE bulks
--     fetch dozens of cached outputs at once
--   - Enables SQL queries like:
--       SELECT path, output_meta->>'summary' FROM code_llm_index
--       WHERE (output_meta->>'confidence')::float > 0.8
--   - Citations stored as a JSONB array so RAG can re-link sources without
--     re-running synthesis
--
-- Idempotent — uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE code_llm_index
  ADD COLUMN IF NOT EXISTS output_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- GIN index for JSONB containment queries (e.g. "all entries with citations from this case")
CREATE INDEX IF NOT EXISTS code_llm_index_output_meta_gin
  ON code_llm_index USING gin (output_meta jsonb_path_ops);

-- Extracted columns via expression indexes for hot filters — no app-layer change needed.
-- These are partial indexes so they only cover rows that actually have the field set.
CREATE INDEX IF NOT EXISTS code_llm_index_confidence_idx
  ON code_llm_index (((output_meta->>'confidence')::real))
  WHERE output_meta ? 'confidence';

CREATE INDEX IF NOT EXISTS code_llm_index_grounding_idx
  ON code_llm_index (((output_meta->>'groundingScore')::real))
  WHERE output_meta ? 'groundingScore';

COMMENT ON COLUMN code_llm_index.output_meta IS
  'Structured summary: { summary: string (≤3 sentences), sentences: string[], citations?: [{chunkId, sourceTitle, quote}], confidence?: number, groundingScore?: number, tokensUsed?: number, model?: string }';
