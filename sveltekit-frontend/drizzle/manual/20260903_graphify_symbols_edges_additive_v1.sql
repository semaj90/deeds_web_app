-- Parent Atlas Graphify symbol/edge tables, additive compatibility migration.
--
-- graphify_files is the existing canonical Graphify file owner. This migration
-- adds only the missing dependent structural tables. It never deletes, rewrites,
-- backfills, invents revisions, or changes graphify_files ownership.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.graphify_files') IS NULL THEN
    RAISE EXCEPTION 'GRAPHIFY_SYMBOLS_EDGES_REQUIRES_EXISTING_GRAPHIFY_FILES';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.graphify_symbols (
  symbol_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.graphify_files(file_id) ON DELETE CASCADE,
  stable_symbol_key text NOT NULL,
  symbol_kind text NOT NULL,
  qualified_name text,
  parent_symbol_id uuid REFERENCES public.graphify_symbols(symbol_id),
  start_byte bigint NOT NULL,
  end_byte bigint NOT NULL,
  start_row integer NOT NULL,
  end_row integer NOT NULL,
  signature_text text,
  source_text_hash text NOT NULL,
  ast_fingerprint text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT graphify_symbols_span_order_v1 CHECK (end_byte >= start_byte),
  CONSTRAINT graphify_symbols_row_order_v1 CHECK (end_row >= start_row),
  CONSTRAINT graphify_symbols_file_key_v1 UNIQUE (file_id, stable_symbol_key)
);

CREATE TABLE IF NOT EXISTS public.graphify_edges (
  edge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  subject_symbol_id uuid NOT NULL REFERENCES public.graphify_symbols(symbol_id) ON DELETE CASCADE,
  predicate text NOT NULL,
  object_symbol_id uuid REFERENCES public.graphify_symbols(symbol_id) ON DELETE SET NULL,
  unresolved_target text,
  evidence_kind text NOT NULL,
  evidence_span jsonb NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_revision text NOT NULL
);

CREATE INDEX IF NOT EXISTS graphify_symbols_stable_key_v1
  ON public.graphify_symbols (stable_symbol_key);
CREATE INDEX IF NOT EXISTS graphify_symbols_file_id_v1
  ON public.graphify_symbols (file_id);
CREATE INDEX IF NOT EXISTS graphify_edges_subject_symbol_v1
  ON public.graphify_edges (subject_symbol_id);
CREATE INDEX IF NOT EXISTS graphify_edges_source_revision_v1
  ON public.graphify_edges (source_revision);

COMMENT ON TABLE public.graphify_symbols IS
  'Revision-qualified structural symbol projection; populated only by the canonical Graphify extractor.';
COMMENT ON TABLE public.graphify_edges IS
  'Revision-qualified structural edge projection; unresolved targets remain explicit and non-canonical.';

COMMIT;
