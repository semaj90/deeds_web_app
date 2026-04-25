-- Migration: add source_uri to documents table and backfill from minio_path -- Timestamp: 2025-10-24 -- This migration
is conservative: it will -- 1) Add a new nullable column 'source_uri' if it doesn't exist -- 2) Backfill 'source_uri'
with the value from existing 'minio_path' for rows where source_uri IS NULL -- 3) Optionally create an index if desired
(commented out) BEGIN; -- 1) Add column if missing ALTER TABLE IF EXISTS public.documents ADD COLUMN IF NOT EXISTS
source_uri TEXT; -- 2) Backfill from minio_path where present UPDATE public.documents SET source_uri = minio_path WHERE
source_uri IS NULL AND minio_path IS NOT NULL; -- 3) (optional) create index for faster lookup if your app queries by
source_uri -- CREATE INDEX IF NOT EXISTS idx_documents_source_uri ON public.documents (source_uri); COMMIT; -- Rollback:
To undo, run: -- BEGIN; ALTER TABLE IF EXISTS public.documents DROP COLUMN IF EXISTS source_uri; COMMIT; -- Notes: -- If
you prefer to rename minio_path -> source_uri, do that in a separate migration with caution and app downtime. -- This
migration is safe to run repeatedly (idempotent for added column and UPDATE respects NULLs).
