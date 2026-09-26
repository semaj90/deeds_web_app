-- Add a dedicated nullable chunk-summary column; legacy `summary` is also
-- exposed as `signature` by the Drizzle model and remains untouched.
BEGIN;

ALTER TABLE public.codebase_chunk_index
  ADD COLUMN IF NOT EXISTS summary_text text;

COMMENT ON COLUMN public.codebase_chunk_index.summary_text IS
  'Dedicated canonical chunk summary text. Populate only through the existing canonical chunk writer after lineage-bound proposal admission.';

COMMIT;
