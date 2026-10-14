-- Align public.parent_atlas_documents with its Drizzle declaration
-- (src/lib/server/db/schema/parent-atlas-documents.ts). Operator-approved 2026-10-13.
-- The 13 columns are declared in the schema but were missing from the live table
-- (contract audit 2026-10-14). Live code reads source_ref_id (telemetry-compressor.ts),
-- and the schema declares the rest. All additions are nullable or carry a constant default,
-- so PostgreSQL 18 records them as metadata-only changes and does not rewrite the 61,718 rows.
-- No existing column is changed or dropped. No row data is written.

BEGIN;

ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS alias_id text;
ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS file_ext text;
ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS index_lane text DEFAULT 'source';
ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS ingest_source text NOT NULL DEFAULT 'codebase-graph';
ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS profile_card_visible boolean DEFAULT true;
ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS source_kind text DEFAULT 'source';
ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS source_ref_id integer;
ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS summary_lod0 text;
ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS summary_lod1 text;
ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS summary_lod2 text;
ALTER TABLE public.parent_atlas_documents ADD COLUMN IF NOT EXISTS tree_node_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'parent_atlas_documents_tree_node_id_fkey'
  ) THEN
    ALTER TABLE public.parent_atlas_documents
      ADD CONSTRAINT parent_atlas_documents_tree_node_id_fkey
      FOREIGN KEY (tree_node_id) REFERENCES public.atlas_tree_nodes (node_id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;

-- Rollback (owner decision only): drop the 13 columns and the constraint. Dropping them loses
-- any values written after this migration, so take a copy first.
