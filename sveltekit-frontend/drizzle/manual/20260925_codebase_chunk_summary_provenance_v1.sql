-- DESIGN ONLY: additive provenance envelope for canonical chunk summaries.
-- Missing model/prompt/runtime parameters remain JSON null; no fabricated defaults.
BEGIN;

ALTER TABLE public.codebase_chunk_index
  ADD COLUMN IF NOT EXISTS summary_provenance jsonb;

COMMENT ON COLUMN public.codebase_chunk_index.summary_provenance IS
  'Nullable atlas.codebase-chunk-summary-provenance.v1 envelope. Binds a chunk summary to exact workspace/source/chunk input and records model/prompt/schema revisions and generation parameters only when observed. Proposal-only values are not canonical admission.';

COMMIT;
