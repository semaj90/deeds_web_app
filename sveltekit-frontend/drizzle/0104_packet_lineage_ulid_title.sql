-- Migration: Add packet ULID, title lineage, and canonical source reference indexes
-- Date: July 2, 2026
-- Purpose: Preserve canonical packet UUID identity while adding sortable lineage and title grouping fields.
-- Notes:
--   - packet_id remains the canonical UUID primary key.
--   - packet_ulid is optional and sortable, useful for workflow/order lookups.
--   - title_id is a semantic grouping key derived from summaries, not a primary key.
--   - canonical_source_ref is the normalized lineage anchor for joins and audit paths.
--
-- This migration is additive and idempotent. It does not rewrite existing data.

BEGIN;

ALTER TABLE public.atlas_packets
  ADD COLUMN IF NOT EXISTS packet_ulid text;

ALTER TABLE public.atlas_packets
  ADD COLUMN IF NOT EXISTS title_id text;

ALTER TABLE public.atlas_packets
  ADD COLUMN IF NOT EXISTS canonical_source_ref text;

CREATE INDEX IF NOT EXISTS idx_atlas_packets_packet_ulid
  ON public.atlas_packets (packet_ulid);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_title_id
  ON public.atlas_packets (title_id);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_canonical_source_ref
  ON public.atlas_packets (canonical_source_ref);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'retrieval_provenance'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rp_canonical_source_ref ON public.retrieval_provenance (canonical_source_ref)';
  END IF;
END $$;

COMMIT;
